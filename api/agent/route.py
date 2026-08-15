"""Couche HTTP de l'identité de l'agent (délègue à `endpoint`)."""

from fastapi import APIRouter

from api.agent import endpoint
from backend.schemas import AgentInfo

router = APIRouter(tags=["agent"])


@router.get("/agent", response_model=AgentInfo)
def get_agent() -> AgentInfo:
    # Public : renvoie l'id stable de l'agent ("Meta_ads") pour le référencer.
    return endpoint.get_agent()
