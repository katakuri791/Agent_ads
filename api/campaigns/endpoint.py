"""Logique des routes campagnes & ads (liste, détail, changement de statut)."""

from typing import Optional

from fastapi import HTTPException

from backend import dashboard
from backend.db import update_fb_ad_status, update_fb_campaign_status
from backend.meta_tools import get_campaign_detail, set_ad_status, set_campaign_status
from backend.schemas import (
    CampaignDetailResponse,
    CampaignStatusUpdate,
    CampaignSummary,
    UserPublic,
)
from api.common import meta_http_error, norm_platform, preset_to_days
from api.deps import resolve_account


def list_campaigns(
    user: UserPublic,
    date_preset: str,
    since: Optional[str],
    until: Optional[str],
    account_id: Optional[str],
    platform: Optional[str],
) -> list[CampaignSummary]:
    settings = resolve_account(user.id, account_id, need_account=True)
    days, all_time = preset_to_days(date_preset)
    try:
        rows = dashboard.list_campaigns(
            settings["meta_ad_account_id"], days=days, all_time=all_time,
            since=since, until=until, platform=norm_platform(platform),
        )
    except Exception as exc:
        raise meta_http_error(exc)
    return [CampaignSummary(**r) for r in rows]


def campaign_detail(
    user: UserPublic,
    campaign_id: str,
    date_preset: str,
    since: Optional[str],
    until: Optional[str],
    section: Optional[str],
    account_id: Optional[str],
) -> CampaignDetailResponse:
    settings = resolve_account(user.id, account_id, need_account=True)
    out: dict = {"adsets": [], "ads": [], "demographics": [], "placements": []}
    # Onglets adsets/ads → cache Supabase (instantané). Démographie/placements →
    # live Meta (chargés à la demande au clic, breakdowns non synchronisés par
    # campagne — cf. plan « Hors scope »).
    try:
        days, all_time = preset_to_days(date_preset)
        start, end, _, _ = dashboard.resolve_window(days, all_time, since, until)
        if section in (None, "adsets"):
            out["adsets"] = dashboard.campaign_adsets(settings["meta_ad_account_id"], campaign_id, start, end)
        if section in (None, "ads"):
            out["ads"] = dashboard.campaign_ads(settings["meta_ad_account_id"], campaign_id, start, end)
        if section in (None, "demographics", "placements"):
            live = get_campaign_detail(
                settings["meta_access_token"], campaign_id,
                date_preset=date_preset, since=since, until=until,
                section=section if section in ("demographics", "placements") else None,
            )
            out["demographics"] = live.get("demographics", [])
            out["placements"] = live.get("placements", [])
    except Exception as exc:
        raise meta_http_error(exc)
    return CampaignDetailResponse(**out)


def update_campaign_status(
    campaign_id: str,
    body: CampaignStatusUpdate,
    user: UserPublic,
    account_id: Optional[str],
) -> dict:
    """Active (ACTIVE) ou met en pause (PAUSED) une campagne Meta. Met aussi à jour
    le cache (fb_campaigns) pour un affichage immédiat dans la liste."""
    settings = resolve_account(user.id, account_id, need_account=True)
    ok, msg = set_campaign_status(settings["meta_access_token"], campaign_id, body.status)
    if not ok:
        raise HTTPException(status_code=502, detail=msg)
    update_fb_campaign_status(campaign_id, body.status)
    return {"ok": True, "status": body.status}


def update_ad_status(
    ad_id: str,
    body: CampaignStatusUpdate,
    user: UserPublic,
    account_id: Optional[str],
) -> dict:
    """Active (ACTIVE) ou met en pause (PAUSED) une ad individuelle. Met aussi à jour
    le cache (fb_ads) pour un affichage immédiat dans le panneau de détail."""
    settings = resolve_account(user.id, account_id, need_account=True)
    ok, msg = set_ad_status(settings["meta_access_token"], ad_id, body.status)
    if not ok:
        raise HTTPException(status_code=502, detail=msg)
    update_fb_ad_status(ad_id, body.status)
    return {"ok": True, "status": body.status}
