import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from .config import (
    CHAT_API_KEY,
    CHAT_API_USER_ID,
    CLIENT_AUTH_URL,
    JWT_ALGORITHM,
    JWT_EXPIRES_HOURS,
    JWT_SECRET,
    supabase_admin,
)
from .schemas import UserPublic

logger = logging.getLogger("metainsight")

bearer_scheme = HTTPBearer(auto_error=True)

# Préfixe des ids d'utilisateurs authentifiés CHEZ LE CLIENT (login délégué).
# `user.id` sert de clé de cloisonnement partout (meta_accounts, conversations,
# notifications…) et nos users locaux ont des PK entières (1, 2, 3…) — comme la
# plateforme du client. Sans préfixe, un utilisateur distant `id=5` hériterait des
# comptes Meta et des conversations de notre user local `id=5`. Le préfixe met les
# deux espaces d'identifiants dans des mondes séparés.
DELEGATED_ID_PREFIX = "tyb:"


def is_delegated_user(user_id: str) -> bool:
    """True si l'id vient du login délégué (⇒ aucune ligne locale dans `users`)."""
    return str(user_id).startswith(DELEGATED_ID_PREFIX)

# Variantes non-bloquantes pour la dépendance mixte clé d'API / JWT : elles ne
# lèvent pas si l'en-tête est absent, on décide nous-mêmes dans get_user_or_api_key.
optional_bearer_scheme = HTTPBearer(auto_error=False)
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_jwt(
    user_id: str,
    *,
    email: Optional[str] = None,
    full_name: Optional[str] = None,
) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    # Identité auto-portée : pour un login délégué (tybotflow), les utilisateurs ne
    # vivent PAS dans SmartDB. On embarque email + nom dans NOTRE JWT pour que
    # get_current_user reconstruise l'utilisateur sans aucune lecture SmartDB.
    if email:
        payload["email"] = email
    if full_name:
        payload["full_name"] = full_name
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ─── Refresh tokens (sessions longues, rotation one-time use) ─────────────────

REFRESH_EXPIRES_DAYS = 30


def _parse_ts(value) -> datetime:
    """Parse un timestamp Supabase (str ISO, parfois 'Z' ou naïf) en datetime aware."""
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def create_refresh_token(user_id: str) -> str:
    """Génère un refresh token opaque (64 hex) et le persiste avec une expiration
    à 30 jours. Renvoyé au client, qui le stocke pour renouveler l'access token."""
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_EXPIRES_DAYS)
    supabase_admin.table("refresh_tokens").insert(
        {"user_id": user_id, "token": token, "expires_at": expires_at.isoformat()}
    ).execute()
    return token


def rotate_refresh_token(refresh_token: str) -> tuple[str, str, UserPublic]:
    """Valide un refresh token, l'invalide (one-time use), puis émet un NOUVEAU
    couple (access, refresh). Lève 401 si introuvable / expiré.

    L'ancien token est supprimé AVANT toute autre vérif : même expiré ou rejoué,
    il ne pourra plus servir (défense contre le rejeu d'un token volé)."""
    res = (
        supabase_admin.table("refresh_tokens")
        .select("*")
        .eq("token", refresh_token)
        .limit(1)
        .execute()
    )
    row = res.data[0] if res.data else None
    if not row:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    # One-time use : on supprime immédiatement, qu'il soit valide ou non.
    supabase_admin.table("refresh_tokens").delete().eq("token", refresh_token).execute()

    if _parse_ts(row["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user_id = row["user_id"]
    user_res = (
        supabase_admin.table("users").select("*").eq("id", user_id).limit(1).execute()
    )
    if not user_res.data:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_jwt(user_id)
    new_refresh = create_refresh_token(user_id)
    return new_access, new_refresh, _user_row_to_public(user_res.data[0])


def revoke_refresh_token(refresh_token: str) -> None:
    """Invalide un refresh token (logout). Idempotent — pas d'erreur si absent."""
    supabase_admin.table("refresh_tokens").delete().eq("token", refresh_token).execute()


def _decode_jwt_payload(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def decode_jwt(token: str) -> str:
    return _decode_jwt_payload(token)["sub"]


def _user_from_claims(payload: dict) -> UserPublic:
    """Reconstruit un UserPublic depuis les claims d'un JWT auto-porté (login
    délégué tybotflow) — SANS lire SmartDB."""
    first, last = _split_full_name(payload.get("full_name"))
    return UserPublic(
        id=str(payload["sub"]),
        email=payload.get("email") or "",
        full_name=payload.get("full_name"),
        first_name=first,
        last_name=last,
    )


def _user_from_token(token: str) -> UserPublic:
    """Résout l'utilisateur d'un JWT. Si le token porte son identité (claim
    `email`, cas du login délégué tybotflow) → reconstruction sans SmartDB. Sinon
    (JWT local historique) → chargement depuis la table `users`."""
    payload = _decode_jwt_payload(token)
    if payload.get("email"):
        return _user_from_claims(payload)
    return _load_user(payload["sub"])


def _split_full_name(full: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not full:
        return None, None
    parts = full.strip().split(None, 1)
    first = parts[0] if parts else None
    last = parts[1] if len(parts) > 1 else None
    return first, last


def _user_row_to_public(row: dict) -> UserPublic:
    full_name = row.get("full_name") or None
    first = row.get("first_name") or None
    last = row.get("last_name") or None
    if (not first or not last) and full_name:
        sf, sl = _split_full_name(full_name)
        first = first or sf
        last = last or sl
    return UserPublic(
        id=row["id"],
        email=row["email"],
        full_name=full_name,
        avatar_url=row.get("avatar_url"),
        first_name=first,
        last_name=last,
        company=row.get("company"),
    )


def update_user_profile(user_id: str, patch: dict) -> UserPublic:
    """Update the users row with whatever columns Supabase accepts.

    Columns that don't exist (e.g. company) are silently dropped so we degrade
    gracefully when the schema hasn't been migrated yet.
    """
    # Utilisateur du login délégué : il n'a AUCUNE ligne dans `users` (son profil
    # vit chez le client). Sans ce garde-fou, la lecture ci-dessous ne trouverait
    # rien → 404 « User not found », incompréhensible pour l'utilisateur.
    if is_delegated_user(user_id):
        raise HTTPException(
            status_code=403,
            detail=(
                "Votre profil est géré par la plateforme de votre entreprise : "
                "il se modifie là-bas, pas ici."
            ),
        )

    clean = {k: v for k, v in patch.items() if v is not None and v != ""}
    # Always keep full_name in sync if first/last provided.
    if "first_name" in clean or "last_name" in clean:
        first = clean.get("first_name", "")
        last = clean.get("last_name", "")
        composed = " ".join(p for p in [first, last] if p).strip()
        if composed:
            clean.setdefault("full_name", composed)

    # Select "*" (not named columns): on a DB where first_name/last_name/company
    # haven't been migrated yet, naming them here makes Postgres reject the whole
    # query (42703) before we ever reach the graceful-degradation logic below.
    # "*" returns whatever columns actually exist, so existing_cols is truthful.
    res = (
        supabase_admin.table("users")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    existing_cols = set(res.data[0].keys())

    # Drop fields we don't have columns for; keep full_name always.
    safe_patch = {k: v for k, v in clean.items() if k in existing_cols or k == "full_name"}
    if not safe_patch:
        return _user_row_to_public(res.data[0])

    try:
        updated = (
            supabase_admin.table("users")
            .update(safe_patch)
            .eq("id", user_id)
            .execute()
        )
        if updated.data:
            return _user_row_to_public(updated.data[0])
    except Exception:
        # If a column truly doesn't exist (unknown to Supabase), retry with
        # only full_name which is guaranteed to exist.
        fallback = {k: v for k, v in safe_patch.items() if k == "full_name"}
        if fallback:
            updated = (
                supabase_admin.table("users")
                .update(fallback)
                .eq("id", user_id)
                .execute()
            )
            if updated.data:
                return _user_row_to_public(updated.data[0])
        raise

    return _user_row_to_public(res.data[0])


def signup(email: str, password: str, full_name: Optional[str]) -> tuple[str, str, UserPublic]:
    # Login délégué actif ⇒ créer un compte local n'a plus aucun sens : il serait
    # impossible de s'y connecter (le login part toujours chez le client). On le
    # refuse explicitement plutôt que de laisser l'utilisateur dans une impasse.
    if CLIENT_AUTH_URL:
        raise HTTPException(
            status_code=403,
            detail=(
                "La création de compte se fait sur la plateforme de votre entreprise. "
                "Connectez-vous ici avec vos identifiants habituels."
            ),
        )

    existing = (
        supabase_admin.table("users").select("id").eq("email", email).execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered")

    inserted = (
        supabase_admin.table("users")
        .insert(
            {
                "email": email,
                "password_hash": hash_password(password),
                "full_name": full_name or "",
            }
        )
        .execute()
    )
    row = inserted.data[0]
    access = create_jwt(row["id"])
    refresh = create_refresh_token(row["id"])
    return access, refresh, _user_row_to_public(row)


def login(email: str, password: str) -> tuple[str, Optional[str], UserPublic]:
    # Login délégué : si l'URL du client est configurée, on authentifie chez lui
    # (tybotflow). Les utilisateurs vivent CHEZ tybotflow, pas dans SmartDB : on ne
    # cherche/crée donc AUCUNE ligne locale. Sinon, login 100 % local (historique).
    if CLIENT_AUTH_URL:
        from .client_auth import client_login  # import tardif : évite un cycle.

        identity = client_login(email, password)  # lève 401 si identifiants faux.
        # Identité issue de la réponse tybotflow (email, sub, nom), ré-encodée dans
        # NOTRE JWT auto-porté → get_current_user n'a plus besoin de SmartDB.
        # Id PRÉFIXÉ (cf. DELEGATED_ID_PREFIX) : jamais de collision avec un id local.
        #
        # ⚠️ Clé de tenant fixée sur l'EMAIL (normalisé), PAS sur remote_user_id :
        # l'email est l'entrée du login → toujours présent et IDENTIQUE à chaque
        # connexion. remote_user_id est optionnel et variable selon la forme de la
        # réponse du client ; l'utiliser comme clé scinderait l'identité d'un même
        # utilisateur entre deux logins (tyb:5 une fois, tyb:email l'autre) → ses
        # comptes Meta et conversations sembleraient perdus. La normalisation
        # (strip + lower) évite un split sur une simple différence de casse.
        tenant_key = (email or identity["email"]).strip().lower()
        user_id = f"{DELEGATED_ID_PREFIX}{tenant_key}"
        email_val = identity["email"]
        full_name = identity.get("full_name")
        public = UserPublic(id=str(user_id), email=email_val, full_name=full_name)
        access = create_jwt(user_id, email=email_val, full_name=full_name)
        # Pas de refresh token pour un user délégué : sa rotation lirait la table
        # `users` (SmartDB) qui n'existe pas ici. La session dure JWT_EXPIRES_HOURS
        # puis re-login. (À brancher sur le refresh tybotflow plus tard si besoin.)
        return access, None, public

    res = (
        supabase_admin.table("users")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    row = res.data[0]
    if not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_jwt(row["id"])
    refresh = create_refresh_token(row["id"])
    return access, refresh, _user_row_to_public(row)


def _load_user(user_id: str) -> UserPublic:
    """Charge un utilisateur par id → UserPublic (401 si introuvable)."""
    res = (
        supabase_admin.table("users")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=401, detail="User not found")
    return _user_row_to_public(res.data[0])


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserPublic:
    return _user_from_token(credentials.credentials)


def get_user_or_api_key(
    api_key: Optional[str] = Depends(api_key_scheme),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme),
) -> UserPublic:
    """Auth mixte pour les intégrateurs externes (Botpress) ET le frontend.

    - Si un header `X-API-Key` valide est fourni → agit au nom de
      `CHAT_API_USER_ID` (pas besoin de JWT). Comparaison en temps constant.
    - Sinon on retombe sur le JWT Bearer habituel (frontend inchangé).
    - Aucun credential valide → 401.

    ⚠️ La clé d'API est un secret partagé : /chat peut créer de vraies campagnes
    Meta. Ne l'exposer qu'à des intégrateurs de confiance et via HTTPS.
    """
    if api_key and CHAT_API_KEY and secrets.compare_digest(api_key, CHAT_API_KEY):
        return _load_user(CHAT_API_USER_ID)
    if credentials is not None:
        return _user_from_token(credentials.credentials)
    raise HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_user_or_public(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme),
) -> UserPublic:
    """Auth « publique » du chat — ne lève JAMAIS 401 (endpoint public).

    - Si un JWT Bearer valide est fourni (le frontend) → agit au nom de cet
      utilisateur → la vraie app garde son multi-utilisateur, inchangée.
    - Si AUCUN credential n'est fourni (Botpress / appel externe) → retombe sur
      l'utilisateur de démo fixe `CHAT_API_USER_ID`. Tout le monde partage donc ce
      compte de démo (et son compte Meta).

    ⚠️ Public = n'importe qui peut appeler /chat. C'est acceptable ici parce que
    (1) l'agent agit toujours au nom d'UN SEUL user de démo (pas d'usurpation
    possible), (2) les campagnes sont créées PAUSED (aucune dépense auto), et
    (3) le rate-limit de /chat, keyé sur cet user, agit comme un frein global.
    Le seul coût réel exposé est la conso LLM. Ne pas y brancher un compte Meta
    sensible.

    ⚠️ Un JWT présent mais INVALIDE lève quand même 401 (jeton cassé = erreur,
    pas un anonyme). Seule l'absence totale de credential ⇒ mode démo.
    """
    if credentials is not None:
        return _user_from_token(credentials.credentials)
    return _load_user(CHAT_API_USER_ID)
