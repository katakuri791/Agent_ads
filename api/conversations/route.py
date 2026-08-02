"""Couche HTTP des conversations (délègue à `endpoint`)."""

from fastapi import APIRouter, Depends

from api.conversations import endpoint
from api.deps import get_current_user
from backend.schemas import ConversationSummary, MessageOut, UserPublic

router = APIRouter(tags=["conversations"])


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(
    user: UserPublic = Depends(get_current_user),
) -> list[ConversationSummary]:
    return endpoint.list_conversations_(user)


@router.post("/conversations", response_model=ConversationSummary)
def create_conversation(
    user: UserPublic = Depends(get_current_user),
) -> ConversationSummary:
    return endpoint.create_conversation_(user)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    conversation_id: str, user: UserPublic = Depends(get_current_user)
) -> list[MessageOut]:
    return endpoint.get_messages(conversation_id, user)
