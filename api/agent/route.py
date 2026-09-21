"""Couche HTTP de l'identité de l'agent (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Header

from api.agent import endpoint
from api.deps import get_current_user
from backend.schemas import AgentInfo, AgentListItem, UserPublic

router = APIRouter(tags=["agent"])


@router.get("/agent", response_model=AgentInfo)
def get_agent() -> AgentInfo:
    # Public : renvoie l'id stable de l'agent ("Meta_ads") pour le référencer.
    return endpoint.get_agent()


@router.get("/agents", response_model=list[AgentListItem])
def list_agents(
    x_client_token: Optional[str] = Header(default=None, alias="X-Client-Token"),
    user: UserPublic = Depends(get_current_user),
) -> list[AgentListItem]:
    # Agents conversationnels du workspace tybotflow (leurs `bot_id`), pour le
    # sélecteur `@nom` du chat. Le token tybotflow vient du login délégué.
    return endpoint.list_workspace_agents(x_client_token)
