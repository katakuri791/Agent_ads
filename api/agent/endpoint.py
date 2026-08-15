"""Logique de l'identité de l'agent IA."""

from backend.agent import AGENT_DESCRIPTION, AGENT_ID, AGENT_NAME
from backend.schemas import AgentInfo


def get_agent() -> AgentInfo:
    """Retourne l'identité de l'unique agent de la plateforme (id stable)."""
    return AgentInfo(id=AGENT_ID, name=AGENT_NAME, description=AGENT_DESCRIPTION)
