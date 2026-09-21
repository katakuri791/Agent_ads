"""Chat UCC (agent externe de la plateforme cliente, ex. « fizzy »).

UCC est une API **webhook** : le POST d'envoi ne renvoie PAS la réponse du bot.
Celle-ci arrive de façon asynchrone par WebSocket, dans l'événement
`bot-message`, après avoir rejoint la « room » = l'id de conversation obtenu via
`START_CONVERSATION_URL`.

Conséquence d'architecture : ce module ne fait QUE les deux appels HTTP
(démarrer la conversation, envoyer le message). L'écoute WebSocket se fait
**depuis le navigateur** (cf. frontend) — un relais côté backend obligerait à
maintenir une connexion par utilisateur pour ne rien apporter.

⚠️ `session_id` est volontairement ABSENT du corps : côté UCC, seul
`external_id` (= l'id de l'utilisateur) identifie l'interlocuteur.
"""

import logging
from typing import Optional

import httpx
from fastapi import HTTPException

from .config import START_CONVERSATION_URL, UCC_HOST, UCC_SEND_URL

logger = logging.getLogger("metainsight")


def start_conversation(client_token: str, bot_id: str, external_id: str) -> str:
    """Ouvre la conversation et renvoie son id (= la room WebSocket à rejoindre).

    Contrat vérifié en live (2026-09-18) : le corps exige `externalUser` et
    `bot_id` (snake_case), et répond `201 {"conversationId": <int>, "isNew": …}`.
    `isNew: false` = la conversation existait déjà, on récupère la même room.
    """
    if not START_CONVERSATION_URL:
        raise HTTPException(status_code=500, detail="Chat service is not configured.")
    try:
        resp = httpx.post(
            START_CONVERSATION_URL,
            json={"externalUser": external_id, "bot_id": bot_id, "channel": "web"},
            headers={
                "accept": "application/json",
                "Authorization": f"Bearer {client_token}",
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("UCC start-conversation unreachable (%s): %s", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail="Chat service unavailable.") from exc

    if resp.status_code >= 400:
        logger.warning("UCC start-conversation %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="Chat service error.")

    data = resp.json() if resp.text else {}
    if not isinstance(data, dict):
        data = {}
    # Clé observée en live : `conversationId` (entier). Les autres formes sont
    # tolérées au cas où l'API évolue, plutôt que de casser sur un renommage.
    conv_id = (
        data.get("conversationId")
        or data.get("conversation_id")
        or data.get("id")
    )
    if not conv_id:
        logger.warning("UCC start-conversation: no conversation id in %s", resp.text[:300])
        raise HTTPException(status_code=502, detail="Chat service error.")
    return str(conv_id)


def send_message(client_token: str, bot_id: str, text: str, external_id: str) -> None:
    """Envoie le message à UCC. Ne renvoie RIEN : la réponse du bot arrivera par
    l'événement WebSocket `bot-message` dans la room de la conversation."""
    if not UCC_SEND_URL:
        raise HTTPException(status_code=500, detail="Chat service is not configured.")
    try:
        resp = httpx.post(
            UCC_SEND_URL,
            json={
                "type": "text",
                "messageText": text,
                "botId": bot_id,
                "external_id": external_id,
                "isintern": True,
                "host": UCC_HOST,
                "channel": "web",
            },
            headers={
                "accept": "application/json",
                "Authorization": f"Bearer {client_token}",
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("UCC send unreachable (%s): %s", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail="Chat service unavailable.") from exc

    if resp.status_code >= 400:
        logger.warning("UCC send %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="Chat service error.")
