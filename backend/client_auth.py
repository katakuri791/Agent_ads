"""Login délégué à la plateforme du client (tybotflow).

Au lieu de vérifier email + mot de passe contre notre table `users`, on relaie la
demande à l'endpoint de login du client (`CLIENT_AUTH_URL`). On ne s'appuie QUE
sur le code de statut HTTP (2xx = ok, 401/400 = mauvais identifiants) : l'identité
locale est ensuite rattachée par email côté `backend/auth.py`. On n'a donc pas
besoin de connaître la forme exacte du corps de réponse du client.

Si un jour on veut exploiter le corps (nom complet, user_id distant…), tout est
déjà parsé au mieux dans `extract_identity()` — il suffira d'ajuster les clés une
fois qu'on aura vu une vraie réponse.
"""

import logging
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
    user = data.get("user") if isinstance(data.get("user"), dict) else {}
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    merged = {**data, **inner, **user}

    token = _first(merged, "token", "access_token", "accessToken", "jwt", "id_token")
    claims: dict = {}
    if token:
        try:
            # On lit les claims SANS vérifier la signature (on fait juste confiance
            # au HTTPS + au statut 2xx du client pour authentifier).
            claims = pyjwt.decode(token, options={"verify_signature": False})
        except Exception:  # noqa: BLE001 — token opaque / non-JWT : on ignore.
            claims = {}

    return {
        "email": _first(merged, "email") or claims.get("email"),
        "full_name": _first(merged, "full_name", "fullName", "name"),
        "remote_user_id": _first(merged, "id", "user_id", "userId") or claims.get("sub"),
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

    headers = {"accept": "application/json", "Content-Type": "application/json"}
    if CLIENT_AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {CLIENT_AUTH_TOKEN}"

    try:
        resp = httpx.post(
            CLIENT_AUTH_URL,
            json={"email": email, "password": password},
            headers=headers,
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("Client auth unreachable: %s", exc)
        raise HTTPException(status_code=502, detail="Authentication service unavailable.")

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
    return identity
