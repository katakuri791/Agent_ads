"""Logique de l'endpoint /meta/dashboard (KPIs adaptatifs + séries + top campagnes)."""

from typing import Optional

from backend import dashboard
from backend.schemas import (
    CampaignSummary,
    DashboardKpi,
    DashboardResponse,
    DashboardSeriesPoint,
    UserPublic,
)
from api.common import meta_http_error, norm_platform
from api.deps import resolve_account


def get_dashboard(
    user: UserPublic,
    days: int,
    period: Optional[str],
    since: Optional[str],
    until: Optional[str],
    account_id: Optional[str],
    platform: Optional[str],
) -> DashboardResponse:
    settings = resolve_account(user.id, account_id, need_account=True)
    all_time = (period or "").lower() == "all"
    plat = norm_platform(platform)
    try:
        data = dashboard.get_account_dashboard(
            settings["meta_ad_account_id"], days=days, all_time=all_time,
            since=since, until=until, platform=plat,
        )
    except Exception as exc:
        raise meta_http_error(exc)

    kpi_row = data.get("kpi_row") or {}

    def _f(v, default=0.0):
        try:
            return float(v) if v not in (None, "") else default
        except (TypeError, ValueError):
            return default

    def _i(v, default=0):
        try:
            return int(float(v)) if v not in (None, "") else default
        except (TypeError, ValueError):
            return default

    impressions = _i(kpi_row.get("impressions"))
    clicks = _i(kpi_row.get("clicks"))
    spend = _f(kpi_row.get("spend"))
    reach = _i(kpi_row.get("reach"))
    ctr = _f(kpi_row.get("ctr"))
    cpc = _f(kpi_row.get("cpc"))
    cpm = _f(kpi_row.get("cpm"))

    def fmt_int(n: int) -> str:
        if n >= 1_000_000:
            return f"{n/1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n/1_000:.1f}K"
        return f"{n}"

    revenue = _f(data.get("revenue"))
    roas = _f(data.get("roas"))
    profit = _f(data.get("profit"))
    leads = _i(data.get("leads"))
    cost_per_lead = _f(data.get("cost_per_lead"))
    conv_rate = _f(data.get("conv_rate"))
    profile = data.get("conversion_profile") or "none"

    ch = data.get("changes") or {}

    # Cartes « résultat » ADAPTATIVES selon le profil réel du compte (aucun chiffre
    # inventé — on n'affiche que ce que Meta remonte) :
    #   • sales → Revenue / ROAS / Profit
    #   • leads → Leads / Coût par lead / Taux de conversion
    #   • none  → Revenue / ROAS / Profit en "—" (aucune conversion trackée)
    if profile == "leads":
        outcome_kpis = [
            DashboardKpi(label="Leads", value=fmt_int(leads), raw=float(leads), change=ch.get("leads")),
            DashboardKpi(label="Coût / lead", value=f"${cost_per_lead:,.2f}", raw=cost_per_lead),
            DashboardKpi(label="Taux conv.", value=f"{conv_rate:.2f}%", raw=conv_rate),
        ]
    else:
        has_revenue = profile == "sales"
        outcome_kpis = [
            DashboardKpi(label="Revenue", value=f"${revenue:,.2f}" if has_revenue else "—", raw=revenue, change=ch.get("revenue")),
            DashboardKpi(label="ROAS", value=f"{roas:.2f}x" if has_revenue else "—", raw=roas),
            DashboardKpi(label="Profit", value=f"${profit:,.2f}" if has_revenue else "—", raw=profit),
        ]

    kpis = [
        DashboardKpi(label="Impressions", value=fmt_int(impressions), raw=impressions, change=ch.get("impressions")),
        DashboardKpi(label="Clicks", value=fmt_int(clicks), raw=clicks, change=ch.get("clicks")),
        DashboardKpi(label="Reach", value=fmt_int(reach), raw=reach, change=ch.get("reach")),
        DashboardKpi(label="Spend", value=f"${spend:,.2f}", raw=spend, change=ch.get("spend")),
        *outcome_kpis,
        DashboardKpi(label="CTR", value=f"{ctr:.2f}%", raw=ctr, change=ch.get("ctr")),
        DashboardKpi(label="CPC", value=f"${cpc:.2f}", raw=cpc, change=ch.get("cpc")),
        DashboardKpi(label="CPM", value=f"${cpm:.2f}", raw=cpm, change=ch.get("cpm")),
    ]

    series = [DashboardSeriesPoint(**p) for p in data.get("series", [])]
    age = data.get("age_breakdown") or []
    gender = data.get("gender_breakdown") or []
    geo = data.get("geo_breakdown") or []

    # Top 5 campaigns by real performance over the SAME window as the KPIs above:
    # conversions, then ROAS, then CTR, then spend (a campaign that improves its
    # results climbs automatically). Optional — ignore errors silently.
    top: list[CampaignSummary] = []
    try:
        camps = dashboard.list_campaigns(
            settings["meta_ad_account_id"], days=days, all_time=all_time,
            since=since, until=until, platform=plat,
        )
        camps.sort(
            key=lambda c: (
                c.get("conversions", 0),
                c.get("roas", 0.0),
                c.get("ctr", 0.0),
                c.get("spend", 0.0),
            ),
            reverse=True,
        )
        top = [CampaignSummary(**c) for c in camps[:5]]
    except Exception:
        pass

    return DashboardResponse(
        days=days,
        kpis=kpis,
        series=series,
        age_breakdown=age,
        gender_breakdown=gender,
        geo_breakdown=geo,
        top_campaigns=top,
        last_activity_date=data.get("last_activity_date"),
    )
