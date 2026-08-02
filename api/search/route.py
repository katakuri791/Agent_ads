"""Couche HTTP des routes de recherche (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.deps import get_current_user
from api.search import endpoint
from backend.schemas import SearchResponse, UserPublic

router = APIRouter(tags=["search"])


@router.get("/meta/geo-search")
def geo_search(
    q: str = Query(..., min_length=1),
    location_types: str = Query("city"),  # csv : "city" | "region" | "city,region"
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[dict]:
    return endpoint.geo_search(user, q, location_types, account_id)


@router.get("/meta/search", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=1),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> SearchResponse:
    return endpoint.search(user, q, account_id)
