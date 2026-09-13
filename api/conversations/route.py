"""Couche HTTP des conversations (délègue à `endpoint`)."""

from fastapi import APIRouter, Depends

from api.conversations import endpoint
from api.deps import get_user_or_public
from backend.schemas import ConversationSummary, MessageOut, UserPublic

router = APIRouter(tags=["conversations"])

# Endpoints PUBLICS (comme /chat) : JWT présent (frontend) → cet utilisateur ;
# aucun credential (Botpress / extérieur) → utilisateur de démo fixe. Voir
# get_user_or_public. Les fils sont donc rangés/lus sous cet utilisateur.


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(
    user: UserPublic = Depends(get_user_or_public),
) -> list[ConversationSummary]:
    return endpoint.list_conversations_(user)


@router.post("/conversations", response_model=ConversationSummary)
def create_conversation(
    user: UserPublic = Depends(get_user_or_public),
) -> ConversationSummary:
    return endpoint.create_conversation_(user)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    conversation_id: str, user: UserPublic = Depends(get_user_or_public)
) -> list[MessageOut]:
    return endpoint.get_messages(conversation_id, user)
