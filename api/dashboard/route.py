"""Couche HTTP de l'endpoint dashboard (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.dashboard import endpoint
from api.deps import get_current_user
from backend.schemas import DashboardResponse, UserPublic

router = APIRouter(tags=["dashboard"])


@router.get("/meta/dashboard", response_model=DashboardResponse)
def get_dashboard(
    days: int = Query(30, ge=1, le=90),
    period: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),  # facebook | instagram | None (toutes)
    user: UserPublic = Depends(get_current_user),
) -> DashboardResponse:
    return endpoint.get_dashboard(user, days, period, since, until, account_id, platform)
