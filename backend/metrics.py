"""Calcul de la métrique de performance d'une campagne selon son objectif.

Le bon indicateur dépend de l'objectif Meta : une campagne ventes se juge au
ROAS, une campagne leads au coût par lead, etc. La logique est pure (pas d'I/O)
et s'applique sur des totaux DÉJÀ agrégés en SQL (cf. fonctions fb_* dans la
migration) — c'est juste un mapping objectif → métrique, pas une agrégation.

Les helpers `_extract_*` servent au worker de sync (backend/facebook_sync.py)
pour pré-extraire les colonnes de conversion depuis les `actions`/`action_values`
bruts renvoyés par Meta, afin que l'agrégation côté SQL reste un simple SUM.
"""

from typing import Any, Optional


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


# ─── Extraction depuis actions / action_values (utilisée par le sync) ─────────
# `actions` et `action_values` reviennent de Meta comme des listes de
# {action_type, value}. On somme la valeur des types demandés.

def _sum_actions(rows: Any, wanted: set[str]) -> float:
    if not isinstance(rows, list):
        return 0.0
    total = 0.0
    for a in rows:
        if isinstance(a, dict) and a.get("action_type") in wanted:
            total += _safe_float(a.get("value"))
    return total


# Types d'action Meta par métrique (les variantes couvrent web + omni + app).
PURCHASE_TYPES = {
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
}
LEAD_TYPES = {
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
    "leadgen_grouped",
}
POST_ENGAGEMENT_TYPES = {"post_engagement"}
MESSAGING_TYPES = {
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
}
APP_INSTALL_TYPES = {"mobile_app_install", "app_install", "omni_app_install"}
LINK_CLICK_TYPES = {"link_click"}
LANDING_PAGE_VIEW_TYPES = {"landing_page_view"}
# Étapes du tunnel e-commerce + engagement social (variantes web + omni).
ADD_TO_CART_TYPES = {
    "add_to_cart",
    "offsite_conversion.fb_pixel_add_to_cart",
    "omni_add_to_cart",
}
INITIATE_CHECKOUT_TYPES = {
    "initiate_checkout",
    "offsite_conversion.fb_pixel_initiate_checkout",
    "omni_initiated_checkout",
}
POST_REACTION_TYPES = {"post_reaction"}
COMMENT_TYPES = {"comment"}
SHARE_TYPES = {"post"}  # chez Meta, action_type "post" = partages
SAVE_TYPES = {"onsite_conversion.post_save"}


def extract_conversion_columns(actions: Any, action_values: Any) -> dict[str, float]:
    """Aplatit les actions/action_values bruts en colonnes numériques stockées
    dans fb_insights_daily. `revenue` = valeur monétaire des achats."""
    return {
        "purchases": _sum_actions(actions, PURCHASE_TYPES),
        "revenue": round(_sum_actions(action_values, PURCHASE_TYPES), 2),
        "leads": _sum_actions(actions, LEAD_TYPES),
        "post_engagement": _sum_actions(actions, POST_ENGAGEMENT_TYPES),
        "messaging_started": _sum_actions(actions, MESSAGING_TYPES),
        "app_installs": _sum_actions(actions, APP_INSTALL_TYPES),
        "link_clicks": _sum_actions(actions, LINK_CLICK_TYPES),
        "landing_page_views": _sum_actions(actions, LANDING_PAGE_VIEW_TYPES),
        # Tunnel e-commerce + engagement social (métriques additionnelles Meta Ads).
        "add_to_cart": _sum_actions(actions, ADD_TO_CART_TYPES),
        "initiate_checkout": _sum_actions(actions, INITIATE_CHECKOUT_TYPES),
        "post_reactions": _sum_actions(actions, POST_REACTION_TYPES),
        "post_comments": _sum_actions(actions, COMMENT_TYPES),
        "post_shares": _sum_actions(actions, SHARE_TYPES),
        "post_saves": _sum_actions(actions, SAVE_TYPES),
    }


# ─── Métriques vidéo ──────────────────────────────────────────────────────────
# Meta renvoie chaque métrique vidéo comme une LISTE de {action_type, value}
# (souvent un seul élément `video_view`). Contrairement à actions/action_values,
# on ne filtre PAS par action_type : le champ ne contient que la métrique voulue.

# Champs insights bruts demandés à Meta → colonne stockée dans fb_insights_daily.
VIDEO_SOURCE_FIELDS: dict[str, str] = {
    "video_3_sec_watched_actions": "video_3s",
    "video_thruplay_watched_actions": "thruplays",
    "video_p25_watched_actions": "video_p25",
    "video_p50_watched_actions": "video_p50",
    "video_p75_watched_actions": "video_p75",
    "video_p100_watched_actions": "video_p100",
    "video_play_actions": "video_plays",
}


def sum_value_list(rows: Any) -> float:
    """Somme les `value` d'un champ Meta renvoyé comme liste de {action_type,
    value} (video_*_watched_actions, outbound_clicks…)."""
    if not isinstance(rows, list):
        return 0.0
    return round(
        sum(_safe_float(a.get("value")) for a in rows if isinstance(a, dict)), 2
    )


def extract_video_columns(row: dict) -> dict[str, float]:
    """Extrait les colonnes vidéo depuis un dict {champ Meta: liste brute}."""
    return {col: sum_value_list(row.get(src)) for src, col in VIDEO_SOURCE_FIELDS.items()}


# ─── Métrique de performance par objectif ─────────────────────────────────────

# Normalise les objectifs ODAX (OUTCOME_*) ET les variantes legacy vers une
# famille interne.
_OBJECTIVE_FAMILY: dict[str, str] = {
    # Ventes / conversions
    "OUTCOME_SALES": "sales",
    "CONVERSIONS": "sales",
    "PURCHASE": "sales",
    "PRODUCT_CATALOG_SALES": "sales",
    # Leads
    "OUTCOME_LEADS": "leads",
    "LEAD_GENERATION": "leads",
    # Engagement
    "OUTCOME_ENGAGEMENT": "engagement",
    "POST_ENGAGEMENT": "engagement",
    "PAGE_LIKES": "engagement",
    "EVENT_RESPONSES": "engagement",
    # Messages
    "OUTCOME_MESSAGES": "messages",
    "MESSAGES": "messages",
    # Notoriété
    "OUTCOME_AWARENESS": "awareness",
    "REACH": "awareness",
    "BRAND_AWARENESS": "awareness",
    # Trafic
    "OUTCOME_TRAFFIC": "traffic",
    "LINK_CLICKS": "traffic",
    # App
    "OUTCOME_APP_PROMOTION": "app",
    "APP_INSTALLS": "app",
}


def _div(numerator: float, denominator: float) -> float:
    """Division protégée : 0.0 si dénominateur nul (pas d'infini ni d'erreur)."""
    if not denominator:
        return 0.0
    return round(numerator / denominator, 2)


def calculate_performance_metric(objective: Optional[str], insights: dict) -> dict:
    """Retourne la métrique pertinente pour l'objectif donné.

    `insights` = totaux agrégés (dict avec au moins spend, impressions, clicks,
    revenue, leads, post_engagement, messaging_started, app_installs).

    Renvoie un dict :
        {"metric_name", "metric_value": float, "is_roas": bool,
         "raw_revenue": float | None}
    """
    spend = _safe_float(insights.get("spend"))
    revenue = _safe_float(insights.get("revenue"))
    impressions = _safe_float(insights.get("impressions"))
    clicks = _safe_float(insights.get("clicks"))

    family = _OBJECTIVE_FAMILY.get((objective or "").upper().strip())

    if family == "sales":
        return {
            "metric_name": "ROAS",
            "metric_value": _div(revenue, spend),
            "is_roas": True,
            "raw_revenue": round(revenue, 2),
        }
    if family == "leads":
        return {
            "metric_name": "CPL",
            "metric_value": _div(spend, _safe_float(insights.get("leads"))),
            "is_roas": False,
            "raw_revenue": None,
        }
    if family == "engagement":
        return {
            "metric_name": "CPE",
            "metric_value": _div(spend, _safe_float(insights.get("post_engagement"))),
            "is_roas": False,
            "raw_revenue": None,
        }
    if family == "messages":
        return {
            "metric_name": "Cost per message",
            "metric_value": _div(spend, _safe_float(insights.get("messaging_started"))),
            "is_roas": False,
            "raw_revenue": None,
        }
    if family == "awareness":
        return {
            "metric_name": "CPM",
            "metric_value": _div(spend * 1000, impressions),
            "is_roas": False,
            "raw_revenue": None,
        }
    if family == "traffic":
        return {
            "metric_name": "CPC",
            "metric_value": _div(spend, clicks),
            "is_roas": False,
            "raw_revenue": None,
        }
    if family == "app":
        return {
            "metric_name": "CPI",
            "metric_value": _div(spend, _safe_float(insights.get("app_installs"))),
            "is_roas": False,
            "raw_revenue": None,
        }

    # Objectif inconnu : ROAS s'il y a du revenu attribué, sinon CPC.
    if revenue > 0:
        return {
            "metric_name": "ROAS",
            "metric_value": _div(revenue, spend),
            "is_roas": True,
            "raw_revenue": round(revenue, 2),
        }
    return {
        "metric_name": "CPC",
        "metric_value": _div(spend, clicks),
        "is_roas": False,
        "raw_revenue": None,
    }
