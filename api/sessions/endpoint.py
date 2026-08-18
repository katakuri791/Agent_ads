"""Logique de la session : toute la discussion d'UNE conversation.

On fournit l'`id` d'une conversation → on renvoie ses métadonnées + tous ses
messages (la discussion complète, dans l'ordre chronologique). C'est la vue
« affiche-moi tout ce que j'ai échangé avec l'agent dans ce fil »."""

from fastapi import HTTPException

from backend.db import get_conversation_by_id, load_messages
from backend.schemas import MessageOut, SessionOut


def get_session(conversation_id: str) -> SessionOut:
    conv = get_conversation_by_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = load_messages(conv["id"])
    return SessionOut(
        conversation_id=str(conv["id"]),
        title=conv.get("title"),
        created_at=conv["created_at"],
        updated_at=conv.get("updated_at"),
        messages=[
            MessageOut(
                id=r["id"],
                role=r["role"],
                content=r["content"],
                created_at=r["created_at"],
                metadata=r.get("metadata") or {},
            )
            for r in rows
        ],
    )
