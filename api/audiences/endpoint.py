"""Logique des routes Audience (audiences custom + reach démographique)."""

from typing import Optional

from backend import dashboard
from backend.meta_tools import audience_reach_live, list_custom_audiences
from backend.schemas import AudienceReachResponse, AudienceSummary, UserPublic
from api.common import meta_http_error, norm_platform
from api.deps import resolve_account


def list_audiences(user: UserPublic, account_id: Optional[str]) -> list[AudienceSummary]:
    settings = resolve_account(user.id, account_id, need_account=True)
    try:
        auds = list_custom_audiences(
            settings["meta_access_token"], settings["meta_ad_account_id"]
        )
    except Exception as exc:
        raise meta_http_error(exc)
    return [AudienceSummary(**a) for a in auds]


def audience_reach(
    user: UserPublic,
    days: int,
    period: Optional[str],
    account_id: Optional[str],
    campaign_id: Optional[str],
    platform: Optional[str],
) -> AudienceReachResponse:
    settings = resolve_account(user.id, account_id, need_account=True)
    all_time = (period or "").lower() == "all"
    plat = norm_platform(platform)
    try:
        # Campagne précise et/ou plateforme → live Meta (hors cache, à la demande).
        # Sinon → cache Supabase (rapide, comportement historique).
        if campaign_id or plat:
            reach = audience_reach_live(
                settings["meta_access_token"], settings["meta_ad_account_id"],
                campaign_id=(campaign_id or None), platform=plat,
                days=days, all_time=all_time,
            )
        else:
            reach = dashboard.get_audience_reach(
                settings["meta_ad_account_id"], days=days, all_time=all_time
            )
    except Exception as exc:
        raise meta_http_error(exc)
    return AudienceReachResponse(**reach)
