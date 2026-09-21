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


@router.post("/creative-ideas")
async def create_creative_idea(
    payload: dict[str, Any],
    _user: UserPublic = Depends(get_user_or_public),
) -> dict[str, Any]:
    """Crée une nouvelle idée créative dans SmartDB."""
    return await endpoint.create_creative_idea(payload)


@router.patch("/creative-ideas/{idea_id}")
async def update_creative_idea(
    idea_id: int,
    payload: dict[str, Any],
    _user: UserPublic = Depends(get_user_or_public),
) -> dict[str, Any]:
    """Met à jour une idée créative existante par URL /creative-ideas/{id}."""
    return await endpoint.update_creative_idea(idea_id, payload)


@router.patch("/creative-ideas")
async def update_creative_idea_body(
    payload: dict[str, Any],
    _user: UserPublic = Depends(get_user_or_public),
) -> dict[str, Any]:
    """Met à jour une idée créative avec l'Id dans le corps."""
    idea_id = payload.get("Id") or payload.get("id")
    if not idea_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Le champ 'Id' est requis dans le payload.")
    clean_payload = {k: v for k, v in payload.items() if k not in ("Id", "id")}
    return await endpoint.update_creative_idea(int(idea_id), clean_payload)


@router.delete("/creative-ideas/{idea_id}")
async def delete_creative_idea(
    idea_id: int,
    _user: UserPublic = Depends(get_user_or_public),
) -> dict[str, Any]:
    """Supprime une idée créative par URL /creative-ideas/{id}."""
    return await endpoint.delete_creative_idea(idea_id)


@router.delete("/creative-ideas")
async def delete_creative_idea_body(
    payload: dict[str, Any],
    _user: UserPublic = Depends(get_user_or_public),
) -> dict[str, Any]:
    """Supprime une idée créative avec l'Id dans le corps."""
    idea_id = payload.get("Id") or payload.get("id")
    if not idea_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Le champ 'Id' est requis dans le payload.")
    return await endpoint.delete_creative_idea(int(idea_id))
