"""Logique des conversations (liste, création, messages)."""

from fastapi import HTTPException

from backend.db import (
    create_conversation,
    get_conversation,
    list_conversations,
    load_messages,
)
from backend.schemas import ConversationSummary, MessageOut, UserPublic


def list_conversations_(user: UserPublic) -> list[ConversationSummary]:
    rows = list_conversations(user.id)
    return [
        ConversationSummary(
            id=r["id"],
            title=r.get("title"),
            created_at=r["created_at"],
            updated_at=r.get("updated_at"),
        )
        for r in rows
    ]


def create_conversation_(user: UserPublic) -> ConversationSummary:
    conv_id = create_conversation(user.id)
    conv = get_conversation(conv_id, user.id)
    return ConversationSummary(
        id=conv["id"],
        title=conv.get("title"),
        created_at=conv["created_at"],
        updated_at=conv.get("updated_at"),
    )


def get_messages(conversation_id: str, user: UserPublic) -> list[MessageOut]:
    conv = get_conversation(conversation_id, user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = load_messages(conversation_id)
    return [
        MessageOut(
            id=r["id"],
            role=r["role"],
            content=r["content"],
            created_at=r["created_at"],
            metadata=r.get("metadata") or {},
        )
        for r in rows
    ]
