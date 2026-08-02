"""Couche HTTP des campagnes & ads (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.campaigns import endpoint
from api.deps import get_current_user
from backend.schemas import (
    CampaignDetailResponse,
    CampaignStatusUpdate,
    CampaignSummary,
    UserPublic,
)

router = APIRouter(tags=["campaigns"])


@router.get("/meta/campaigns", response_model=list[CampaignSummary])
def list_campaigns(
    date_preset: str = Query("last_30d"),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),  # facebook | instagram | None (toutes)
    user: UserPublic = Depends(get_current_user),
) -> list[CampaignSummary]:
    return endpoint.list_campaigns(user, date_preset, since, until, account_id, platform)


@router.get("/meta/campaigns/{campaign_id}/detail", response_model=CampaignDetailResponse)
def campaign_detail(
    campaign_id: str,
    date_preset: str = Query("last_30d"),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    # `section` = onglet demandé (adsets|ads|demographics|placements). Le frontend
    # charge un onglet à la fois → ~2 appels Meta au lieu de 6 par ouverture, ce
    # qui évite le "User request limit reached". Absent = tout (compat).
    section: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> CampaignDetailResponse:
    return endpoint.campaign_detail(
        user, campaign_id, date_preset, since, until, section, account_id
    )


@router.patch("/meta/campaigns/{campaign_id}/status")
def update_campaign_status(
    campaign_id: str,
    body: CampaignStatusUpdate,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.update_campaign_status(campaign_id, body, user, account_id)


@router.patch("/meta/ads/{ad_id}/status")
def update_ad_status(
    ad_id: str,
    body: CampaignStatusUpdate,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.update_ad_status(ad_id, body, user, account_id)
