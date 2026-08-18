"""Couche HTTP de la session (délègue à `endpoint`)."""

from fastapi import APIRouter

from api.sessions import endpoint
from backend.schemas import SessionOut

router = APIRouter(tags=["sessions"])


@router.get("/sessions/{conversation_id}", response_model=SessionOut)
def get_session(conversation_id: str) -> SessionOut:
    # PUBLIC (comme /chat & /conversations) : on fournit l'id de la conversation et
    # on récupère toute sa discussion. L'id de conversation fait office de handle.
    return endpoint.get_session(conversation_id)
