"""Ré-implémentation Python des fonctions d'agrégation SQL (dashboard).

SmartDB (NocoDB) n'a **pas de fonctions SQL ni d'agrégation** : le dashboard
appelait des fonctions Postgres (`fb_summary`, `fb_campaign_agg`, …) via
`supabase_admin.rpc(...)`. Ici on les reproduit en Python — on tire les lignes
brutes de `fb_insights_daily` / `fb_insights_breakdowns` / `fb_insights_platform_daily`
via l'adaptateur SmartDB, puis on SUM/GROUP en mémoire.

⚠️ Règle conservée à l'identique des migrations 0002/0009/0010 : ctr/cpc/cpm/
frequency sont **recalculés depuis les sommes** (jamais une moyenne de taux), et
arrondis à 4 décimales façon Postgres (half-up). Les clés de sortie reprennent
exactement les noms de colonnes des `RETURNS TABLE` SQL → comportement frontend
inchangé.

Chaque fonction a la signature `fn(client, params)` où `params` reprend les mêmes
clés que l'appel SQL (`p_account`, `p_start`, `p_end`, `p_campaign`, `p_adset`,
`p_platform`, `p_type`). Le routage vient de `smartdb._RpcQuery`.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

# Colonnes sommées (mêmes noms que fb_insights_daily / _platform_daily).
_SUM_COLS = [
    "spend", "impressions", "clicks", "reach", "purchases", "revenue", "leads",
    "post_engagement", "messaging_started", "app_installs", "link_clicks",
    "landing_page_views", "inline_link_clicks", "unique_clicks", "outbound_clicks",
    "add_to_cart", "initiate_checkout", "post_reactions", "post_comments",
    "post_shares", "post_saves", "video_3s", "thruplays", "video_p25", "video_p50",
    "video_p75", "video_p100", "video_plays",
]
_INT_COLS = ("impressions", "clicks", "reach")


def _n(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _round4(x: float) -> float:
    """Arrondi à 4 décimales, half-up (comme ROUND(numeric,4) en Postgres)."""
    return float(Decimal(str(x)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def _ctr(clicks: float, impressions: float) -> float:
    return _round4(clicks / impressions * 100) if impressions else 0.0


def _cpc(spend: float, clicks: float) -> float:
    return _round4(spend / clicks) if clicks else 0.0


def _cpm(spend: float, impressions: float) -> float:
    return _round4(spend / impressions * 1000) if impressions else 0.0


def _frequency(impressions: float, reach: float) -> float:
    return _round4(impressions / reach) if reach else 0.0


def _sum_rows(rows: list[dict]) -> dict:
    """Somme toutes les colonnes _SUM_COLS sur un lot de lignes."""
    agg = {c: 0.0 for c in _SUM_COLS}
    for r in rows:
        for c in _SUM_COLS:
            agg[c] += _n(r.get(c))
    for c in _INT_COLS:
        agg[c] = int(agg[c])
    return agg


def _with_rates_full(agg: dict) -> dict:
    """Ajoute ctr/cpc/cpm/frequency (bloc complet vidéo, comme fb_summary 0009)."""
    agg["ctr"] = _ctr(agg["clicks"], agg["impressions"])
    agg["cpc"] = _cpc(agg["spend"], agg["clicks"])
    agg["cpm"] = _cpm(agg["spend"], agg["impressions"])
    agg["frequency"] = _frequency(agg["impressions"], agg["reach"])
    return agg


def _fetch_insights(
    client,
    table: str,
    account: str,
    start: str,
    end: str,
    platform: Optional[str] = None,
) -> list[dict]:
    """Tire les lignes d'insights niveau ad pour un compte sur une période."""
    q = (
        client.table(table)
        .select("*")
        .eq("ad_account_id", account)
        .gte("date", start)
        .lte("date", end)
    )
    if platform is not None:
        q = q.eq("platform", platform)
    return q.execute().data


# ── fb_summary (0009) ────────────────────────────────────────────────────────
def fb_summary(client, params: dict) -> dict:
    rows = _fetch_insights(
        client, "fb_insights_daily",
        params["p_account"], params["p_start"], params["p_end"],
    )
    return _with_rates_full(_sum_rows(rows))


# ── fb_campaign_agg (0009) — LEFT JOIN : toutes les campagnes ─────────────────
def fb_campaign_agg(client, params: dict) -> list[dict]:
    account, start, end = params["p_account"], params["p_start"], params["p_end"]
    campaigns = (
        client.table("fb_campaigns").select("*").eq("ad_account_id", account).execute().data
    )
    rows = _fetch_insights(client, "fb_insights_daily", account, start, end)
    by_campaign: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_campaign[r.get("campaign_id")].append(r)

    out = []
    for c in campaigns:
        agg = _with_rates_full(_sum_rows(by_campaign.get(c["id"], [])))
        out.append({
            "id": c["id"], "name": c.get("name"), "objective": c.get("objective"),
            "status": c.get("status"), "daily_budget": c.get("daily_budget"),
            **agg,
        })
    return out


# ── fb_adset_agg (0002) — LEFT JOIN, filtre campagne optionnel ────────────────
def fb_adset_agg(client, params: dict) -> list[dict]:
    account, start, end = params["p_account"], params["p_start"], params["p_end"]
    campaign = params.get("p_campaign")
    q = client.table("fb_adsets").select("*").eq("ad_account_id", account)
    if campaign is not None:
        q = q.eq("campaign_id", campaign)
    adsets = q.execute().data
    rows = _fetch_insights(client, "fb_insights_daily", account, start, end)
    by_adset: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_adset[r.get("adset_id")].append(r)

    out = []
    for a in adsets:
        agg = _sum_rows(by_adset.get(a["id"], []))
        out.append({
            "id": a["id"], "name": a.get("name"), "status": a.get("status"),
            "optimization_goal": a.get("optimization_goal"),
            "daily_budget": a.get("daily_budget"),
            "lifetime_budget": a.get("lifetime_budget"),
            "targeting": a.get("targeting"), "campaign_id": a.get("campaign_id"),
            "spend": agg["spend"], "impressions": agg["impressions"],
            "clicks": agg["clicks"], "reach": agg["reach"],
            "purchases": agg["purchases"], "revenue": agg["revenue"],
            "ctr": _ctr(agg["clicks"], agg["impressions"]),
            "cpc": _cpc(agg["spend"], agg["clicks"]),
        })
    return out


# ── fb_ad_agg (0002) — LEFT JOIN, filtres campagne / adset optionnels ─────────
def fb_ad_agg(client, params: dict) -> list[dict]:
    account, start, end = params["p_account"], params["p_start"], params["p_end"]
    campaign, adset = params.get("p_campaign"), params.get("p_adset")
    q = client.table("fb_ads").select("*").eq("ad_account_id", account)
    if campaign is not None:
        q = q.eq("campaign_id", campaign)
    if adset is not None:
        q = q.eq("adset_id", adset)
    ads = q.execute().data
    rows = _fetch_insights(client, "fb_insights_daily", account, start, end)
    by_ad: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_ad[r.get("ad_id")].append(r)

    out = []
    for a in ads:
        agg = _sum_rows(by_ad.get(a["id"], []))
        out.append({
            "id": a["id"], "name": a.get("name"), "status": a.get("status"),
            "format": a.get("format"), "thumbnail_url": a.get("thumbnail_url"),
            "adset_id": a.get("adset_id"), "campaign_id": a.get("campaign_id"),
            "spend": agg["spend"], "impressions": agg["impressions"],
            "clicks": agg["clicks"], "reach": agg["reach"],
            "purchases": agg["purchases"], "revenue": agg["revenue"],
            "leads": agg["leads"],
            "ctr": _ctr(agg["clicks"], agg["impressions"]),
            "cpc": _cpc(agg["spend"], agg["clicks"]),
        })
    return out


# ── fb_timeseries (0002) — group by date ─────────────────────────────────────
def fb_timeseries(client, params: dict) -> list[dict]:
    rows = _fetch_insights(
        client, "fb_insights_daily",
        params["p_account"], params["p_start"], params["p_end"],
    )
    return _timeseries(rows)


def _timeseries(rows: list[dict]) -> list[dict]:
    by_date: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_date[str(r.get("date"))[:10]].append(r)
    out = []
    for d in sorted(by_date):
        agg = _sum_rows(by_date[d])
        out.append({
            "date": d,
            "spend": agg["spend"], "impressions": agg["impressions"],
            "reach": agg["reach"], "clicks": agg["clicks"],
            "conversions": agg["purchases"] + agg["leads"],
            "revenue": agg["revenue"],
            "ctr": _ctr(agg["clicks"], agg["impressions"]),
        })
    return out


# ── fb_breakdown (0002) — group by key1,key2 ─────────────────────────────────
def fb_breakdown(client, params: dict) -> list[dict]:
    account, start, end = params["p_account"], params["p_start"], params["p_end"]
    btype = params["p_type"]
    rows = (
        client.table("fb_insights_breakdowns")
        .select("*")
        .eq("ad_account_id", account)
        .eq("breakdown_type", btype)
        .gte("date", start)
        .lte("date", end)
        .execute()
        .data
    )
    grouped: dict[tuple, dict] = defaultdict(
        lambda: {"impressions": 0, "clicks": 0, "spend": 0.0, "reach": 0}
    )
    for r in rows:
        k = (r.get("key1"), r.get("key2", ""))
        g = grouped[k]
        g["impressions"] += int(_n(r.get("impressions")))
        g["clicks"] += int(_n(r.get("clicks")))
        g["spend"] += _n(r.get("spend"))
        g["reach"] += int(_n(r.get("reach")))
    return [
        {"key1": k1, "key2": k2, **g} for (k1, k2), g in grouped.items()
    ]


# ── Variantes plateforme (0010) ──────────────────────────────────────────────
def fb_summary_platform(client, params: dict) -> dict:
    rows = _fetch_insights(
        client, "fb_insights_platform_daily",
        params["p_account"], params["p_start"], params["p_end"],
        platform=params["p_platform"],
    )
    return _with_rates_full(_sum_rows(rows))


def fb_campaign_agg_platform(client, params: dict) -> list[dict]:
    account, start, end = params["p_account"], params["p_start"], params["p_end"]
    platform = params["p_platform"]
    rows = _fetch_insights(
        client, "fb_insights_platform_daily", account, start, end, platform=platform
    )
    by_campaign: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_campaign[r.get("campaign_id")].append(r)
    if not by_campaign:
        return []
    # INNER JOIN : seulement les campagnes qui ont des insights sur la plateforme.
    campaigns = (
        client.table("fb_campaigns").select("*").eq("ad_account_id", account).execute().data
    )
    meta_by_id = {c["id"]: c for c in campaigns}
    out = []
    for cid, crows in by_campaign.items():
        c = meta_by_id.get(cid)
        if not c:
            continue
        agg = _with_rates_full(_sum_rows(crows))
        out.append({
            "id": c["id"], "name": c.get("name"), "objective": c.get("objective"),
            "status": c.get("status"), "daily_budget": c.get("daily_budget"),
            **agg,
        })
    return out


def fb_timeseries_platform(client, params: dict) -> list[dict]:
    rows = _fetch_insights(
        client, "fb_insights_platform_daily",
        params["p_account"], params["p_start"], params["p_end"],
        platform=params["p_platform"],
    )
    return _timeseries(rows)
