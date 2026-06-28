"""Lectures dashboard depuis le cache Supabase (zéro appel Meta).

Remplace les fonctions live de meta_tools (get_account_dashboard,
list_campaigns_with_insights, get_account_audience_reach, sections du détail
campagne) par des lectures du cache `fb_*`, en conservant **exactement** les
mêmes shapes de sortie → les routes FastAPI et le frontend restent inchangés.

Toute l'agrégation est faite en SQL (fonctions fb_* / db.rpc_fb_*). Ici on ne
fait que de la mise en forme légère.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any, Callable, Optional

from . import db, metrics
from .meta_tools import (
    _format_label,
    _pct_change,
    _safe_float,
    _safe_int,
    _summarize_targeting,
)

# Borne basse pour le mode « all time » : BETWEEN cette date et aujourd'hui couvre
# tout l'historique présent dans le cache.
_EPOCH = "2000-01-01"


def resolve_window(
    days: int = 30,
    all_time: bool = False,
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> tuple[str, str, Optional[str], Optional[str]]:
    """Retourne (start, end, prev_start, prev_end) en dates ISO.

    prev_* = fenêtre précédente de même longueur (pour le change %), ou None
    quand il n'y a pas de comparaison pertinente (all time)."""
    today = date.today()
    if all_time:
        return _EPOCH, today.isoformat(), None, None
    if since and until:
        s = date.fromisoformat(since)
        u = date.fromisoformat(until)
        span = (u - s).days
        prev_u = s - timedelta(days=1)
        prev_s = prev_u - timedelta(days=span)
        return s.isoformat(), u.isoformat(), prev_s.isoformat(), prev_u.isoformat()
    end = today
    start = today - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat(), prev_start.isoformat(), prev_end.isoformat()


def _parallel(tasks: dict[str, Callable[[], Any]]) -> dict[str, Any]:
    """Exécute des appels RPC indépendants en parallèle. Le dashboard fait ~6
    requêtes Supabase indépendantes ; les enchaîner en série = ~6× le RTT réseau.
    En parallèle, la latence ≈ celle d'UN appel (le client httpx est thread-safe)."""
    out: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        futures = {name: pool.submit(fn) for name, fn in tasks.items()}
        for name, fut in futures.items():
            out[name] = fut.result()
    return out


def _share(rows: list[dict], key: str = "key1") -> list[dict]:
    """Convertit des lignes breakdown en parts (% des impressions)."""
    total = sum(_safe_int(r.get("impressions")) for r in rows) or 1
    out = []
    for r in rows:
        imp = _safe_int(r.get("impressions"))
        out.append({"name": r.get(key) or "?", "value": round(imp * 100 / total, 1)})
    return out


def _geo(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        imp = _safe_int(r.get("impressions"))
        clicks = _safe_int(r.get("clicks"))
        out.append({
            "code": r.get("key1"),
            "spend": _safe_float(r.get("spend")),
            "impressions": imp,
            "clicks": clicks,
            "ctr": round(clicks / imp * 100, 2) if imp else 0.0,
        })
    return out


# ─── Dashboard (Overview) ─────────────────────────────────────────────────────


def get_account_dashboard(
    account_id: str,
    days: int = 30,
    all_time: bool = False,
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> dict[str, Any]:
    start, end, prev_start, prev_end = resolve_window(days, all_time, since, until)

    # Les 6 lectures sont indépendantes → en parallèle (≈ 1 RTT au lieu de 6).
    tasks: dict[str, Callable[[], Any]] = {
        "summary": lambda: db.rpc_fb_summary(account_id, start, end),
        "series": lambda: db.rpc_fb_timeseries(account_id, start, end),
        "age": lambda: db.rpc_fb_breakdown(account_id, start, end, "age"),
        "gender": lambda: db.rpc_fb_breakdown(account_id, start, end, "gender"),
        "country": lambda: db.rpc_fb_breakdown(account_id, start, end, "country"),
    }
    if prev_start:
        tasks["prev"] = lambda: db.rpc_fb_summary(account_id, prev_start, prev_end)
    res = _parallel(tasks)
    summary = res["summary"]
    prev = res.get("prev") or {}

    # kpi_row : mêmes clés que ce que renvoyait Meta (consommé tel quel par main.py).
    kpi_row = {
        "impressions": _safe_int(summary.get("impressions")),
        "clicks": _safe_int(summary.get("clicks")),
        "spend": _safe_float(summary.get("spend")),
        "reach": _safe_int(summary.get("reach")),
        "ctr": _safe_float(summary.get("ctr")),
        "cpc": _safe_float(summary.get("cpc")),
        "cpm": _safe_float(summary.get("cpm")),
    }

    revenue = _safe_float(summary.get("revenue"))
    spend = kpi_row["spend"]
    roas = round(revenue / spend, 2) if spend else 0.0
    profit = round(revenue - spend, 2)

    # Profil de conversion du compte (données réelles agrégées) : un compte qui
    # génère des leads sans aucun revenu d'achat se juge au coût par lead, pas au
    # ROAS. main.py choisit les cartes KPI à afficher en fonction de ce profil.
    leads = _safe_int(summary.get("leads"))
    purchases = _safe_int(summary.get("purchases"))
    clicks = kpi_row["clicks"]
    cost_per_lead = round(spend / leads, 2) if leads else 0.0
    conv_rate = round(leads / clicks * 100, 2) if clicks else 0.0
    if revenue > 0:
        conversion_profile = "sales"
    elif leads > 0:
        conversion_profile = "leads"
    else:
        conversion_profile = "none"

    def _chg(field: str, *, integer: bool = False) -> Optional[float]:
        if not prev_start:
            return None
        cur = _safe_int(summary.get(field)) if integer else _safe_float(summary.get(field))
        pv = _safe_int(prev.get(field)) if integer else _safe_float(prev.get(field))
        return _pct_change(cur, pv)

    prev_revenue = _safe_float(prev.get("revenue"))
    changes = {
        "impressions": _chg("impressions", integer=True),
        "clicks": _chg("clicks", integer=True),
        "reach": _chg("reach", integer=True),
        "spend": _chg("spend"),
        "ctr": _chg("ctr"),
        "cpc": _chg("cpc"),
        "cpm": _chg("cpm"),
        "revenue": None if not prev_start else _pct_change(revenue, prev_revenue),
        "leads": _chg("leads", integer=True),
    }

    series = []
    for r in res["series"]:
        d_spend = _safe_float(r.get("spend"))
        d_clicks = _safe_int(r.get("clicks"))
        d_impr = _safe_int(r.get("impressions"))
        d_revenue = _safe_float(r.get("revenue"))
        series.append({
            "date": str(r.get("date") or ""),
            "impressions": d_impr,
            "reach": _safe_int(r.get("reach")),
            "clicks": d_clicks,
            "spend": d_spend,
            "ctr": _safe_float(r.get("ctr")),
            # Métriques dérivées par jour (données réelles, calculées — pas de fake).
            "revenue": d_revenue,
            "profit": round(d_revenue - d_spend, 2),
            # `conversions` SQL = purchases + leads ; pour un compte lead (0 achat)
            # c'est exactement les leads → sert de courbe de tendance à la sparkline.
            "leads": _safe_float(r.get("conversions")),
            "cpc": round(d_spend / d_clicks, 2) if d_clicks else 0.0,
            "cpm": round(d_spend / d_impr * 1000, 2) if d_impr else 0.0,
            "roas": round(d_revenue / d_spend, 2) if d_spend else 0.0,
        })

    age = _share(res["age"])
    gender = _share(res["gender"])
    geo = _geo(res["country"])

    return {
        "kpi_row": kpi_row,
        "changes": changes,
        "series": series,
        "age_breakdown": age,
        "gender_breakdown": gender,
        "geo_breakdown": geo,
        "revenue": revenue,
        "roas": roas,
        "profit": profit,
        "leads": leads,
        "purchases": purchases,
        "cost_per_lead": cost_per_lead,
        "conv_rate": conv_rate,
        "conversion_profile": conversion_profile,
    }


# ─── Campagnes (liste + métrique par objectif) ───────────────────────────────


def _campaign_row(r: dict) -> dict[str, Any]:
    spend = _safe_float(r.get("spend"))
    revenue = _safe_float(r.get("revenue"))
    conversions = _safe_int(r.get("purchases")) + _safe_int(r.get("leads"))
    roas = round(revenue / spend, 2) if spend else 0.0
    roi = round((revenue - spend) / spend * 100, 1) if spend else 0.0
    perf = metrics.calculate_performance_metric(r.get("objective"), r)
    daily_budget = r.get("daily_budget")
    return {
        "id": r.get("id"),
        "name": r.get("name"),
        "objective": r.get("objective"),
        "status": r.get("status"),
        "created_time": r.get("created_time"),
        "daily_budget": _safe_float(daily_budget) if daily_budget is not None else None,
        "impressions": _safe_int(r.get("impressions")),
        "clicks": _safe_int(r.get("clicks")),
        "spend": spend,
        "ctr": _safe_float(r.get("ctr")),
        "cpc": _safe_float(r.get("cpc")),
        "conversions": conversions,
        "roas": roas,
        "revenue": revenue,
        "roi": roi,
        "metric_name": perf["metric_name"],
        "metric_value": perf["metric_value"],
        "is_roas": perf["is_roas"],
    }


def list_campaigns(
    account_id: str,
    days: int = 30,
    all_time: bool = False,
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> list[dict[str, Any]]:
    start, end, _, _ = resolve_window(days, all_time, since, until)
    return [_campaign_row(r) for r in db.rpc_fb_campaign_agg(account_id, start, end)]


# ─── Audience reach (page Audiences) ─────────────────────────────────────────


def get_audience_reach(
    account_id: str,
    days: int = 30,
    all_time: bool = False,
) -> dict[str, Any]:
    start, end, _, _ = resolve_window(days, all_time)

    res = _parallel({
        "age": lambda: db.rpc_fb_breakdown(account_id, start, end, "age"),
        "gender": lambda: db.rpc_fb_breakdown(account_id, start, end, "gender"),
        "country": lambda: db.rpc_fb_breakdown(account_id, start, end, "country"),
        "platform": lambda: db.rpc_fb_breakdown(account_id, start, end, "publisher_platform"),
        "age_gender": lambda: db.rpc_fb_breakdown(account_id, start, end, "age_gender"),
        "summary": lambda: db.rpc_fb_summary(account_id, start, end),
    })

    age = _share(res["age"])
    gender = _share(res["gender"])
    geo = _geo(res["country"])

    placements = []
    plac_rows = res["platform"]
    total = sum(_safe_int(r.get("impressions")) for r in plac_rows) or 1
    for r in plac_rows:
        imp = _safe_int(r.get("impressions"))
        name = (r.get("key1") or "?").replace("_", " ").title()
        placements.append({"name": name, "value": round(imp * 100 / total, 1)})

    # Démographie age×gender → [{age, male, female}] (impressions brutes).
    agg: dict[str, dict[str, int]] = {}
    for r in res["age_gender"]:
        a = r.get("key1") or "?"
        bucket = agg.setdefault(a, {"male": 0, "female": 0})
        imp = _safe_int(r.get("impressions"))
        if r.get("key2") == "male":
            bucket["male"] += imp
        elif r.get("key2") == "female":
            bucket["female"] += imp
    demographics = [
        {"age": a, "male": agg[a]["male"], "female": agg[a]["female"]}
        for a in sorted(agg.keys())
    ]

    summary = res["summary"]
    return {
        "reach_total": _safe_int(summary.get("reach")),
        "age_breakdown": age,
        "gender_breakdown": gender,
        "demographics": demographics,
        "placements": placements,
        "geo_breakdown": geo,
    }


# ─── Détail campagne : onglets adsets / ads (depuis le cache) ─────────────────


def campaign_adsets(account_id: str, campaign_id: str, start: str, end: str) -> list[dict]:
    out = []
    for r in db.rpc_fb_adset_agg(account_id, start, end, campaign_id):
        spend = _safe_float(r.get("spend"))
        revenue = _safe_float(r.get("revenue"))
        budget = r.get("daily_budget") if r.get("daily_budget") is not None else r.get("lifetime_budget")
        out.append({
            "name": r.get("name") or "Ad set",
            "status": (r.get("status") or "ACTIVE"),
            "budget": _safe_float(budget) if budget is not None else None,
            "audience": _summarize_targeting(r.get("targeting")),
            "optimization_goal": r.get("optimization_goal"),
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "spend": spend,
            "cpc": round(_safe_float(r.get("cpc")), 2),
            "ctr": round(_safe_float(r.get("ctr")), 2),
            "roas": round(revenue / spend, 2) if spend else 0.0,
        })
    return out


def campaign_ads(account_id: str, campaign_id: str, start: str, end: str) -> list[dict]:
    out = []
    for r in db.rpc_fb_ad_agg(account_id, start, end, campaign_id):
        conversions = _safe_int(r.get("purchases")) + _safe_int(r.get("leads"))
        out.append({
            "name": r.get("name") or "Ad",
            "status": (r.get("status") or "ACTIVE"),
            "format": _format_label(r.get("format")),
            "thumbnail_url": r.get("thumbnail_url"),
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": round(_safe_float(r.get("ctr")), 2),
            "cpc": round(_safe_float(r.get("cpc")), 2),
            "spend": _safe_float(r.get("spend")),
            "conversions": conversions,
        })
    return out
