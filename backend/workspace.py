"""Agents conversationnels du workspace tybotflow.

La plateforme du client regroupe ses agents (« smart services ») dans un
workspace. On interroge `CHATBOT_WORKSPACES_URL?workspace_id=WORKSPACE_ID` pour
en extraire les `bot_id` (ex. `fizzy`) que l'utilisateur pourra cibler avec
`@nom` dans le chat.

⚠️ Ce `bot_id` est l'identité d'un AGENT conversationnel — à ne pas confondre
avec le champ `bot_id` du corps de `/chat/botpress`, qui désigne le compte Meta
ciblé (`account_id`, cf. `backend/agent.py`). Deux notions distinctes.

L'appel est authentifié avec le token tybotflow de l'utilisateur (celui renvoyé
par le login délégué, cf. `client_auth.extract_identity`) : on ne détient aucun
secret de service pour ce workspace.
"""

import logging
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from .config import CHATBOT_WORKSPACES_URL, WORKSPACE_ID

logger = logging.getLogger("metainsight")


def _first(data: dict, *keys: str) -> Optional[Any]:
    """Renvoie la première clé présente et non vide parmi `keys`."""
    for k in keys:
        v = data.get(k)
        if v:
            return v
    return None


def _iter_services(data: Any) -> list[dict]:
    """Extrait la liste des smart services, quelle que soit l'enveloppe JSON.

    La réponse peut être une liste nue, ou un objet enveloppant la liste sous
    `data` / `list` / `result` / `services` / `smart_services` (formes courantes
    côté tybotflow ; NocoDB utilise `list`). On ne devine rien au-delà : si
    aucune liste n'est trouvée, on renvoie vide plutôt qu'une donnée inventée.
    """
    if isinstance(data, list):
        return [it for it in data if isinstance(it, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("data", "list", "result", "results", "services", "smart_services", "smartServices"):
        inner = data.get(key)
        if isinstance(inner, list):
            return [it for it in inner if isinstance(it, dict)]
        # Enveloppe à deux niveaux : {"data": {"list": [...]}}
        if isinstance(inner, dict):
            nested = _iter_services(inner)
            if nested:
                return nested
    return []


def extract_agents(data: Any) -> list[dict]:
    """Réduit la réponse du workspace à `[{id, name}, …]` — un par agent.

    `id` = le `bot_id` à renvoyer au chat ; `name` = le libellé affiché et la
    cible du `@mention`. Les entrées sans `bot_id` sont ignorées (on ne peut pas
    parler à un agent qu'on ne sait pas nommer).
    """
    agents: list[dict] = []
    seen: set[str] = set()
    for svc in _iter_services(data):
        bot_id = _first(svc, "bot_id", "botId", "botID")
        if not bot_id:
            continue
        bot_id = str(bot_id).strip()
        if not bot_id or bot_id in seen:
            continue
        seen.add(bot_id)
        name = _first(svc, "name", "bot_name", "botName", "title", "label")
        agents.append({"id": bot_id, "name": str(name).strip() if name else bot_id})
    return agents


def list_agents(client_token: str, workspace_id: Optional[str] = None) -> list[dict]:
    """Liste les agents du workspace. `client_token` = token tybotflow de
    l'utilisateur (login délégué). Lève 502 si le service est injoignable."""
    workspace_id = (workspace_id or WORKSPACE_ID or "").strip()
    if not workspace_id:
        raise HTTPException(status_code=500, detail="Workspace is not configured.")

    try:
        resp = httpx.get(
            f"{CHATBOT_WORKSPACES_URL.rstrip('/')}/{workspace_id}",
            headers={
                "accept": "application/json",
                "Authorization": f"Bearer {client_token}",
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("Workspace unreachable (%s): %s", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail="Agent service unavailable.") from exc

    if resp.status_code in (401, 403):
        # Token utilisateur expiré / non autorisé sur ce workspace.
        raise HTTPException(status_code=502, detail="Agent service rejected the request.")
    if resp.status_code >= 400:
        logger.warning("Workspace error %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="Agent service error.")

    try:
        data = resp.json()
    except Exception:  # noqa: BLE001 — 2xx non-JSON : aucun agent exploitable.
        logger.warning("Workspace returned non-JSON body: %s", resp.text[:300])
        return []

    agents = extract_agents(data)
    if not agents:
        # Utile au diagnostic : la forme du JSON a peut-être changé.
        logger.info("Workspace %s returned no usable bot_id", workspace_id)
    return agents
