import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import (
    JWT_ALGORITHM,
    JWT_EXPIRES_HOURS,
    JWT_SECRET,
    supabase_admin,
)
from .schemas import UserPublic

bearer_scheme = HTTPBearer(auto_error=True)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
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


def decode_jwt(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


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


def login(email: str, password: str) -> tuple[str, str, UserPublic]:
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


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserPublic:
    user_id = decode_jwt(credentials.credentials)
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
