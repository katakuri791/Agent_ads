"""Couche HTTP pour la gestion des idées créatives."""

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from api.creative_ideas import endpoint
from api.deps import get_user_or_public
from backend.schemas import UserPublic

router = APIRouter(tags=["creative-ideas"])


@router.get("/creative-ideas")
async def list_creative_ideas(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    _user: UserPublic = Depends(get_user_or_public),
) -> dict[str, Any]:
    """Liste les idées créatives stockées dans SmartDB."""
    return await endpoint.get_creative_ideas(limit=limit, offset=offset, search=search)
