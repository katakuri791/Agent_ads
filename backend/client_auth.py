"""Login délégué à la plateforme du client (tybotflow).

Au lieu de vérifier email + mot de passe contre notre table `users`, on relaie la
demande à l'endpoint de login du client (`CLIENT_AUTH_URL`). On s'appuie sur le
code de statut HTTP (2xx = ok, 401/400 = mauvais identifiants) pour authentifier,
puis on EXPLOITE le corps de réponse (cf. output.txt) pour récupérer le vrai
`user_id` distant (`userData.id` = UUID tybotflow), le nom et l'email.

`extract_identity()` parse ce corps de façon tolérante (plusieurs formes de clés
possibles) ; `remote_user_id` sert désormais de clé de tenant côté `backend/auth.py`
(cloisonnement des comptes Meta / conversations par personne).
"""

import logging
import time
from typing import Any, Optional

import httpx
import jwt as pyjwt
from fastapi import HTTPException

from .config import CLIENT_AUTH_TOKEN, CLIENT_AUTH_URL

logger = logging.getLogger("metainsight")


def _first(data: dict, *keys: str) -> Optional[Any]:
    """Renvoie la première clé présente et non vide parmi `keys` (au 1er niveau)."""
    for k in keys:
        v = data.get(k)
        if v:
            return v
    return None


def extract_identity(data: dict) -> dict:
    """Best-effort : extrait (email, full_name, remote_user_id, token) de la
    réponse du client, quelle que soit sa forme approximative. Aucune de ces
    valeurs n'est indispensable au login (on rattache par l'email envoyé), mais on
    les remonte si disponibles. Les clés seront ajustées quand on aura le vrai JSON.
    """
    if not isinstance(data, dict):
        return {}
    # Certaines APIs enveloppent la charge utile dans `data` / `result` / `user`.
    # ⚠️ tybotflow renvoie l'objet utilisateur sous la clé `userData` (cf.
    # output.txt : `userData.id` = l'UUID réel de la personne) → on le fusionne
    # AUSSI pour récupérer le vrai `remote_user_id` (et prénom/nom).
    user = data.get("user") if isinstance(data.get("user"), dict) else {}
    user_data = data.get("userData") if isinstance(data.get("userData"), dict) else {}
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    merged = {**data, **inner, **result, **user, **user_data}

    token = _first(merged, "token", "access_token", "accessToken", "jwt", "id_token")
    claims: dict = {}
    if token:
        try:
            # On lit les claims SANS vérifier la signature (on fait juste confiance
            # au HTTPS + au statut 2xx du client pour authentifier).
            claims = pyjwt.decode(token, options={"verify_signature": False})
        except Exception:  # noqa: BLE001 — token opaque / non-JWT : on ignore.
            claims = {}

    # Nom complet : soit un champ direct, soit recomposé depuis prénom + nom
    # séparés (cas très courant : firstName / lastName ou les claims OIDC).
    full_name = _first(merged, "full_name", "fullName", "name")
    if not full_name:
        first = _first(merged, "first_name", "firstName", "given_name") or claims.get("given_name")
        last = _first(merged, "last_name", "lastName", "family_name") or claims.get("family_name")
        full_name = " ".join(p for p in [first, last] if p).strip() or None

    return {
        "email": _first(merged, "email") or claims.get("email"),
        "full_name": full_name or claims.get("name"),
        "remote_user_id": _first(merged, "id", "user_id", "userId", "uid") or claims.get("sub"),
        "token": token,
    }


def client_login(email: str, password: str) -> dict:
    """Appelle l'endpoint de login du client. Lève 401 si identifiants invalides,
    502 si le service est injoignable / répond une erreur inattendue. En cas de
    succès, renvoie le dict de `extract_identity` (l'email est garanti — on
    retombe sur celui fourni si le client ne le renvoie pas)."""
    if not CLIENT_AUTH_URL:
        # Ne devrait pas arriver : l'appelant ne délègue que si l'URL est définie.
        raise HTTPException(status_code=500, detail="Client auth is not configured.")

    # L'endpoint de login de tybotflow s'authentifie UNIQUEMENT via email+password
    # dans le corps : il renvoie 200 sans aucun header `Authorization`. On n'attache
    # donc JAMAIS de Bearer ici — un `CLIENT_AUTH_TOKEN` parasite (défini par erreur
    # dans l'env de prod) ferait échouer le login en 401 alors que les identifiants
    # sont bons. Le comportement ne dépend plus d'une variable d'env côté serveur.
    headers = {"accept": "application/json", "Content-Type": "application/json"}

    # Retry court (3 tentatives, backoff 0.5s puis 1s) : un blip réseau transitoire
    # (DNS/TLS/connexion qui rate une fraction de seconde, ou tybotflow qui redémarre)
    # ne doit pas renvoyer un 502 à l'utilisateur alors que ses identifiants sont bons.
    # ⚠️ On ne retente QUE les erreurs de transport (httpx.HTTPError) : un 401 (mauvais
    # mot de passe) n'est PAS une exception ici → jamais retenté.
    resp = None
    for attempt in range(3):
        try:
            resp = httpx.post(
                CLIENT_AUTH_URL,
                json={"email": email, "password": password},
                headers=headers,
                timeout=15.0,
            )
            break
        except httpx.HTTPError as exc:
            # On loggue le TYPE d'erreur (ConnectError / ConnectTimeout / ReadTimeout…)
            # → diagnostic immédiat si le 502 persiste après les 3 essais.
            logger.warning(
                "Client auth unreachable (try %d/3, %s): %s",
                attempt + 1,
                type(exc).__name__,
                exc,
            )
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    if resp is None:
        raise HTTPException(status_code=502, detail="Authentication service unavailable.")

    # Log du résultat de l'appel au service d'auth client (pour debug). On tronque
    # le corps et on ne loggue JAMAIS le mot de passe (il est dans la requête, pas
    # dans la réponse). ⚠️ Niveau DEBUG volontairement : la réponse du client
    # contient un token d'accès — il ne doit pas atterrir dans les logs de prod
    # (niveau INFO). Passer le logger en DEBUG le temps d'un diagnostic.
    logger.debug(
        "Client auth POST %s -> %s | body: %s",
        CLIENT_AUTH_URL,
        resp.status_code,
        resp.text[:1000],
    )

    # Mauvais identifiants → on renvoie le MÊME message que le login local pour ne
    # rien divulguer (email inexistant vs mot de passe faux).
    if resp.status_code in (400, 401, 422):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # 403 = probablement le token de service (CLIENT_AUTH_TOKEN) manquant/expiré,
    # PAS un mauvais mot de passe utilisateur → on le distingue pour le debug.
    if resp.status_code == 403:
        logger.warning("Client auth 403 (service token?): %s", resp.text[:500])
        raise HTTPException(status_code=502, detail="Authentication service rejected the request.")
    if resp.status_code >= 400:
        logger.warning("Client auth error %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="Authentication service error.")

    try:
        data = resp.json()
    except Exception:  # noqa: BLE001 — réponse 2xx non-JSON : on continue quand même.
        data = {}

    identity = extract_identity(data)
    identity["email"] = identity.get("email") or email  # garanti non vide.
    # On conserve le corps de réponse BRUT du client (tel quel) : `login()` le
    # renverra à l'appelant dans `AuthResponse.client_response` (l'intégralité de
    # l'output de l'endpoint /auth/login de tybotflow, pas seulement l'identité).
    identity["raw"] = data if isinstance(data, dict) else {}
    return identity
