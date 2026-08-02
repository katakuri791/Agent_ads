"""Logique des routes de recherche (recherche globale + autocomplétion géo)."""

from typing import Optional

from backend import meta_pages
from backend.db import get_meta_account
from backend.meta_tools import list_campaigns_with_insights, search_geo_locations
from backend.schemas import SearchResponse, SearchResultItem, UserPublic
from api.common import meta_http_error
from api.deps import resolve_account


def geo_search(
    user: UserPublic, q: str, location_types: str, account_id: Optional[str]
) -> list[dict]:
    """Autocomplétion de vraies localisations Meta (villes/régions) pour le ciblage
    géographique d'une campagne — clé de ciblage + région + pays."""
    settings = resolve_account(user.id, account_id, need_account=True)
    types = [t.strip() for t in location_types.split(",") if t.strip()] or ["city"]
    try:
        return search_geo_locations(settings["meta_access_token"], q, types)
    except Exception as exc:
        raise meta_http_error(exc)


def search(user: UserPublic, q: str, account_id: Optional[str]) -> SearchResponse:
    # Recherche best-effort : compte manquant/partiel → résultats vides, jamais 500.
    settings = get_meta_account(user.id, account_id) or {}
    needle = q.strip().lower()
    results: list[SearchResultItem] = []

    # Campaigns
    if settings.get("meta_access_token") and settings.get("meta_ad_account_id"):
        try:
            camps = list_campaigns_with_insights(
                settings["meta_access_token"],
                settings["meta_ad_account_id"],
                date_preset="last_30d",
            )
            for c in camps:
                name = (c.get("name") or "").strip()
                if needle in name.lower():
                    results.append(
                        SearchResultItem(
                            kind="campaign",
                            id=str(c.get("id")),
                            title=name,
                            subtitle=f"{c.get('objective','?')} · {c.get('status','?')}",
                        )
                    )
        except Exception:
            pass

    # Posts + Page
    if settings.get("meta_access_token") and settings.get("meta_page_id"):
        try:
            posts = meta_pages.list_page_posts(
                settings["meta_page_id"], settings["meta_access_token"], limit=25
            )
            for p in posts:
                msg = (p.get("message") or "").strip()
                if needle in msg.lower():
                    results.append(
                        SearchResultItem(
                            kind="post",
                            id=str(p.get("id")),
                            title=msg[:80] + ("…" if len(msg) > 80 else ""),
                            subtitle=p.get("created_time"),
                            url=p.get("permalink_url"),
                        )
                    )
        except Exception:
            pass

        try:
            info = meta_pages.get_page_info(
                settings["meta_page_id"], settings["meta_access_token"]
            )
            name = (info.get("name") or "").strip()
            if needle in name.lower():
                results.insert(
                    0,
                    SearchResultItem(
                        kind="page",
                        id=str(settings["meta_page_id"]),
                        title=name,
                        subtitle=info.get("category"),
                        url=info.get("link"),
                    ),
                )
        except Exception:
            pass

    return SearchResponse(query=q, results=results[:30])
