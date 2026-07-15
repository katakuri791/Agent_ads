"""Tests du parsing Instagram (backend/meta_instagram.py).

La logique risquée est l'extraction de la portée (« combien de gens ont vu ») et
la conversion média Graph → post normalisé. Les fonctions sont pures (pas d'I/O),
donc testables sans réseau. Un parse faux = de fausses vues affichées à l'user.
"""

from backend import meta_instagram


def test_insight_value_extracts_reach():
    insights = {"data": [
        {"name": "reach", "values": [{"value": 1234}]},
        {"name": "impressions", "values": [{"value": 5678}]},
    ]}
    assert meta_instagram._insight_value(insights, "reach") == 1234
    assert meta_instagram._insight_value(insights, "impressions") == 5678


def test_insight_value_missing_metric_is_none():
    # Reels/Stories peuvent ne pas renvoyer impressions → None (jamais 0 inventé).
    insights = {"data": [{"name": "reach", "values": [{"value": 10}]}]}
    assert meta_instagram._insight_value(insights, "impressions") is None
    assert meta_instagram._insight_value(None, "reach") is None
    assert meta_instagram._insight_value({}, "reach") is None


def test_post_from_media_full():
    m = {
        "id": "media_1",
        "caption": "Bonjour",
        "media_type": "VIDEO",
        "media_product_type": "REELS",
        "thumbnail_url": "http://x/thumb.jpg",
        "permalink": "http://insta/p/1",
        "timestamp": "2026-07-01T10:00:00+0000",
        "like_count": 42,
        "comments_count": 7,
        "insights": {"data": [
            {"name": "reach", "values": [{"value": 900}]},
            {"name": "impressions", "values": [{"value": 1500}]},
        ]},
    }
    p = meta_instagram._post_from_media(m)
    assert p["id"] == "media_1"
    assert p["reach"] == 900
    assert p["impressions"] == 1500
    assert p["like_count"] == 42
    assert p["comments_count"] == 7
    assert p["media_product_type"] == "REELS"


def test_post_from_media_without_insights():
    # Média sans portée (scope manquant / variante dégradée) → reach/impr = None.
    m = {"id": "media_2", "media_type": "IMAGE", "like_count": None, "comments_count": None}
    p = meta_instagram._post_from_media(m)
    assert p["reach"] is None
    assert p["impressions"] is None
    assert p["like_count"] == 0
    assert p["comments_count"] == 0
