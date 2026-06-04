"""Graph API helpers for Facebook Page operations.

We use plain `requests` rather than the facebook-business SDK here because the
Pages endpoints are simple HTTP and the SDK's verbose object model is overkill.

All functions take the USER access token. When a page-level action requires
a Page Access Token (publishing posts, reading some insights), we resolve it
on the fly via /me/accounts.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

GRAPH = "https://graph.facebook.com/v21.0"
TIMEOUT = 20


class GraphError(RuntimeError):
    """Raised when Meta Graph returns an error."""


def _check(resp: requests.Response) -> dict:
    try:
        data = resp.json()
    except ValueError:
        raise GraphError(f"Réponse non JSON ({resp.status_code}) : {resp.text[:200]}")
    if not resp.ok or (isinstance(data, dict) and "error" in data):
        err = data.get("error", {}) if isinstance(data, dict) else {}
        msg = err.get("message") or resp.text[:200]
        code = err.get("code")
        sub = err.get("error_subcode")
        suffix = ""
        if code is not None or sub is not None:
            suffix = f" (code={code}, subcode={sub})"
        raise GraphError(f"{msg}{suffix}")
    return data


def resolve_page_token(user_token: str, page_id: str) -> str:
    """Find the Page Access Token for a given page_id by listing the user's pages.

    Page Access Tokens are required for publishing and for some insights.
    """
    resp = requests.get(
        f"{GRAPH}/me/accounts",
        params={"access_token": user_token, "fields": "id,access_token,name"},
        timeout=TIMEOUT,
    )
    data = _check(resp)
    pages = data.get("data", [])
    for p in pages:
        if str(p.get("id")) == str(page_id):
            token = p.get("access_token")
            if not token:
                raise GraphError("Page trouvée mais aucun access_token retourné.")
            return token
    raise GraphError(
        f"Page id={page_id} introuvable parmi les pages gérées par cet utilisateur."
    )


def get_page_info(page_id: str, user_token: str) -> dict[str, Any]:
    fields = (
        "name,category,about,fan_count,followers_count,link,website,picture.type(large)"
    )
    resp = requests.get(
        f"{GRAPH}/{page_id}",
        params={"access_token": user_token, "fields": fields},
        timeout=TIMEOUT,
    )
    data = _check(resp)
    # Flatten picture.data.url
    pic = data.get("picture", {})
    if isinstance(pic, dict):
        data["picture_url"] = pic.get("data", {}).get("url")
    return data


_POST_FIELDS = (
    "message,created_time,permalink_url,full_picture,"
    "reactions.summary(total_count).limit(0),"
    "comments.summary(total_count).limit(0),"
    "shares"
)

# Engagement summaries (reactions/comments) require the `pages_read_engagement`
# permission. When a token lacks it Meta returns error (#10); we then fall back
# to these minimal fields so the posts themselves still load (engagement at 0).
_POST_FIELDS_MINIMAL = "message,created_time,permalink_url,full_picture"


def _fetch_posts(page_id: str, token: str, params: dict[str, Any]) -> tuple[dict, bool]:
    """GET /{page}/posts, degrading to minimal fields if the engagement fields
    trip a permission error. Returns (response_json, engagement_blocked)."""
    try:
        return _check(requests.get(f"{GRAPH}/{page_id}/posts", params={**params, "fields": _POST_FIELDS}, timeout=TIMEOUT)), False
    except GraphError:
        # Retry without the engagement summaries; if this still fails, the token
        # has a deeper problem, so let that error surface.
        data = _check(requests.get(f"{GRAPH}/{page_id}/posts", params={**params, "fields": _POST_FIELDS_MINIMAL}, timeout=TIMEOUT))
        return data, True


def _parse_post(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "message": row.get("message"),
        "created_time": row.get("created_time"),
        "permalink_url": row.get("permalink_url"),
        "full_picture": row.get("full_picture"),
        "reactions": (row.get("reactions") or {}).get("summary", {}).get("total_count", 0),
        "comments": (row.get("comments") or {}).get("summary", {}).get("total_count", 0),
        "shares": (row.get("shares") or {}).get("count", 0),
    }


def _page_token_or_user(page_id: str, user_token: str) -> str:
    """Reading a Page's own posts (and their reaction/comment summaries) needs a
    Page access token. Fall back to the user token if it can't be resolved."""
    try:
        return resolve_page_token(user_token, page_id)
    except GraphError:
        return user_token


def list_page_posts(
    page_id: str, user_token: str, limit: int = 5
) -> list[dict[str, Any]]:
    token = _page_token_or_user(page_id, user_token)
    data, _ = _fetch_posts(page_id, token, {"access_token": token, "limit": limit})
    return [_parse_post(row) for row in data.get("data", [])]


def get_page_post_summary(
    page_id: str, user_token: str, limit: int = 100
) -> dict[str, Any]:
    """Aggregate the page's recent posts: counts + likes/comments/shares totals,
    plus the top 3 posts by engagement. Everything from the real /posts edge.

    Degrades gracefully: if the token lacks `pages_read_engagement`, posts still
    load with engagement at 0 and `engagement_blocked` flags the limitation."""
    token = _page_token_or_user(page_id, user_token)
    base = {"access_token": token, "limit": limit}
    # `summary=true` gives an exact total_count but is not supported on every
    # edge — fall back to a plain request and count what we fetched.
    try:
        data, blocked = _fetch_posts(page_id, token, {**base, "summary": "true"})
    except GraphError:
        data, blocked = _fetch_posts(page_id, token, base)
    posts = [_parse_post(row) for row in data.get("data", [])]

    total = (data.get("summary") or {}).get("total_count")
    posts_count = int(total) if isinstance(total, (int, float)) else len(posts)

    reactions = sum(p["reactions"] for p in posts)
    comments = sum(p["comments"] for p in posts)
    shares = sum(p["shares"] for p in posts)
    top_posts = sorted(
        posts, key=lambda p: p["reactions"] + p["comments"] + p["shares"], reverse=True
    )[:3]

    return {
        "posts_count": posts_count,
        "reactions": reactions,
        "comments": comments,
        "shares": shares,
        "top_posts": top_posts,
        "posts": posts,
        "engagement_blocked": blocked,
    }


def create_page_post(
    page_id: str,
    user_token: str,
    message: str,
    link: Optional[str] = None,
) -> dict[str, Any]:
    """Publish a new post. Requires a Page Access Token (auto-resolved)."""
    page_token = resolve_page_token(user_token, page_id)
    params: dict[str, Any] = {"message": message, "access_token": page_token}
    if link:
        params["link"] = link
    resp = requests.post(
        f"{GRAPH}/{page_id}/feed",
        data=params,
        timeout=TIMEOUT,
    )
    return _check(resp)


def get_page_insights(
    page_id: str, user_token: str, days: int = 28
) -> dict[str, int]:
    """Aggregate page insights over the last N days.

    Sums the daily values of: page_impressions, page_engaged_users,
    page_post_engagements. Also returns the current followers/fans count.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    until = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        page_token = resolve_page_token(user_token, page_id)
    except GraphError:
        page_token = user_token  # fallback — may still work for some metrics

    totals: dict[str, int] = {
        "impressions": 0, "engaged_users": 0, "post_engagements": 0,
        "reach_total": 0, "reach_organic": 0, "reach_paid": 0,
    }
    name_map = {
        "page_impressions": "impressions",
        "page_engaged_users": "engaged_users",
        "page_post_engagements": "post_engagements",
        "page_impressions_unique": "reach_total",
        "page_impressions_organic_unique": "reach_organic",
        "page_impressions_paid_unique": "reach_paid",
    }

    def _sum_metrics(metric_csv: str) -> None:
        """Fetch and accumulate a group of metrics. Guarded independently so a
        single deprecated metric never zeroes out the others (Meta fails the
        whole call when ANY requested metric is invalid)."""
        try:
            resp = requests.get(
                f"{GRAPH}/{page_id}/insights",
                params={
                    "access_token": page_token,
                    "metric": metric_csv,
                    "period": "day",
                    "since": since,
                    "until": until,
                },
                timeout=TIMEOUT,
            )
            data = _check(resp)
        except (GraphError, requests.RequestException):
            return  # garde les totaux à zéro pour ce groupe
        for series in data.get("data", []):
            key = name_map.get(series.get("name"))
            if not key:
                continue
            for v in series.get("values", []):
                val = v.get("value", 0)
                if isinstance(val, (int, float)):
                    totals[key] += int(val)
                elif isinstance(val, dict):
                    # Some metrics return a dict (breakdowns) — sum nested ints.
                    totals[key] += sum(int(x) for x in val.values() if isinstance(x, (int, float)))

    # Engagement metrics and reach metrics in separate calls (see _sum_metrics).
    _sum_metrics("page_impressions,page_engaged_users,page_post_engagements")
    _sum_metrics("page_impressions_unique,page_impressions_organic_unique,page_impressions_paid_unique")

    # Current fan/follower count is a separate field, not an insight metric.
    try:
        info = get_page_info(page_id, user_token)
        totals["fans"] = int(info.get("followers_count") or info.get("fan_count") or 0)
    except GraphError:
        totals["fans"] = 0

    return totals
