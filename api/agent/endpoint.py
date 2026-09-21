"""Logique de l'identité de l'agent IA."""

import logging
from typing import Optional

from fastapi import HTTPException

from backend.agent import AGENT_DESCRIPTION, AGENT_ID, AGENT_NAME
from backend.config import KNOWN_AGENT_IDS
from backend.schemas import AgentInfo, AgentListItem
from backend.workspace import list_agents as workspace_list_agents

logger = logging.getLogger("metainsight")


def get_agent() -> AgentInfo:
    """Retourne l'identité de l'unique agent de la plateforme (id stable)."""
    return AgentInfo(id=AGENT_ID, name=AGENT_NAME, description=AGENT_DESCRIPTION)


def list_workspace_agents(client_token: Optional[str]) -> list[AgentListItem]:
    """Liste les agents conversationnels adressables par `@nom` dans le chat.

    Source principale : le workspace tybotflow, interrogé avec le token de
    l'utilisateur (`client_token`, issu du login délégué, en-tête
    `X-Client-Token`). Il fait autorité — lui seul connaît les agents réellement
    déployés.

    À défaut (login local, workspace muet ou injoignable), on retombe sur
    `KNOWN_AGENT_IDS`, la même liste que celle qui sert déjà à distinguer un
    agent d'un compte Meta côté `/chat`. Sans ce repli, le menu « @ » resterait
    vide alors que le backend, lui, accepte déjà ces agents.
    """
    if (client_token or "").strip():
        try:
            agents = workspace_list_agents(client_token)
            if agents:
                return [AgentListItem(**a) for a in agents]
        except HTTPException:
            # Workspace injoignable : le chat doit rester utilisable.
            logger.warning("Workspace unreachable, falling back to KNOWN_AGENT_IDS")
    # Le nôtre a un libellé propre ; les autres n'ont que leur id tant que le
    # workspace n'a pas répondu.
    return [
        AgentListItem(id=a, name=AGENT_NAME if a == AGENT_ID else a)
        for a in KNOWN_AGENT_IDS
    ]
