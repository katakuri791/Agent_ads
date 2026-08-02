"""Couche HTTP des routes Audience (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.audiences import endpoint
from api.deps import get_current_user
from backend.schemas import AudienceReachResponse, AudienceSummary, UserPublic

router = APIRouter(tags=["audiences"])


@router.get("/meta/audiences", response_model=list[AudienceSummary])
def list_audiences(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[AudienceSummary]:
    return endpoint.list_audiences(user, account_id)


@router.get("/meta/audience-reach", response_model=AudienceReachResponse)
def audience_reach(
    days: int = Query(30, ge=1, le=90),
    period: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    campaign_id: Optional[str] = Query(None),  # None = tout le compte
    platform: Optional[str] = Query(None),     # facebook | instagram | None
    user: UserPublic = Depends(get_current_user),
) -> AudienceReachResponse:
    return endpoint.audience_reach(user, days, period, account_id, campaign_id, platform)
