"""Graph API helpers for Facebook Page operations.

We use plain `requests` rather than the facebook-business SDK here because the
Pages endpoints are simple HTTP and the SDK's verbose object model is overkill.

All functions take the USER access token. When a page-level action requires
a Page Access Token (publishing posts, reading some insights), we resolve it
on the fly via /me/accounts.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

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
    """Résout le Page Access Token pour `page_id`. Gère les DEUX types de token :

    1. Token UTILISATEUR → on liste les pages gérées via /me/accounts (scope
       `pages_show_list`) et on en extrait l'access_token de la page cible.
    2. Token de PAGE déjà fourni → /me/accounts renvoie alors l'erreur (#100)
       « nonexisting field (accounts) » (un node Page n'a pas d'arête accounts).
       Dans ce cas on vérifie via /me que le token EST bien celui de la page cible
       et on le retourne tel quel.

    Un Page Access Token (+ `pages_read_engagement`) est requis pour lire les
    summaries d'engagement et pour publier."""
    # Cas 1 : token utilisateur — énumération des pages gérées.
    try:
        data = _check(requests.get(
            f"{GRAPH}/me/accounts",
            params={"access_token": user_token, "fields": "id,access_token,name"},
            timeout=TIMEOUT,
        ))
        for p in data.get("data", []):
            if str(p.get("id")) == str(page_id):
                token = p.get("access_token")
                if not token:
                    raise GraphError("Page trouvée mais aucun access_token retourné.")
                return token
        # Page absente de la liste : peut-être un token de page → on tente le cas 2.
    except GraphError as e:
        # /me/accounts échoue typiquement avec (#100) quand le token est DÉJÀ un
        # token de page (me = node Page, qui n'a pas de champ `accounts`).
        logger.info("/me/accounts indisponible (token de page probable ?) : %s", e)

    # Cas 2 : le token fourni est peut-être directement celui de la page cible.
    me = _check(requests.get(
        f"{GRAPH}/me",
        params={"access_token": user_token, "fields": "id,name"},
        timeout=TIMEOUT,
    ))
    if str(me.get("id")) == str(page_id):
        return user_token  # le token fourni EST le Page Access Token de la page cible

    raise GraphError(
        f"Page id={page_id} introuvable : le token n'énumère pas cette page "
        f"(/me/accounts) et n'est pas non plus le token de cette page "
        f"(/me.id={me.get('id')})."
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


def _fetch_posts(
    page_id: str, token: str, params: dict[str, Any]
) -> tuple[dict, Optional[str]]:
    """GET /{page}/posts. En cas d'erreur sur les champs d'engagement, on dégrade
    vers des champs minimaux MAIS on conserve le message Meta réel comme `reason`.

    Retourne (json, reason) où `reason` est None si l'engagement a bien été chargé,
    sinon la chaîne de l'erreur Meta exacte (message + code + subcode). On ne masque
    plus la cause derrière un simple booléen."""
    try:
        data = _check(requests.get(
            f"{GRAPH}/{page_id}/posts",
            params={**params, "fields": _POST_FIELDS},
            timeout=TIMEOUT,
        ))
        return data, None
    except GraphError as e:
        reason = str(e)  # ← on garde le message Meta exact (code/subcode)
        logger.warning("Engagement non chargé sur /%s/posts : %s", page_id, reason)
        # Re-essai en champs minimaux : si ça échoue encore, le token a un problème
        # plus profond, on laisse donc cette erreur remonter.
        data = _check(requests.get(
            f"{GRAPH}/{page_id}/posts",
            params={**params, "fields": _POST_FIELDS_MINIMAL},
            timeout=TIMEOUT,
        ))
        return data, reason


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


def _page_token_or_user(
    page_id: str, user_token: str
) -> tuple[str, bool, Optional[str]]:
    """Lire les posts d'une Page (et leurs summaries réactions/commentaires) exige
    un Page Access Token. Si on ne peut pas le résoudre, on retombe sur le token
    utilisateur MAIS on journalise et on expose la raison — au lieu de prétendre
    silencieusement que c'est un problème d'App Review.

    Retourne (token, used_page_token, token_error) où `used_page_token` indique si
    on a bien obtenu un Page Access Token, et `token_error` la raison de l'échec."""
    try:
        return resolve_page_token(user_token, page_id), True, None
    except GraphError as e:
        msg = str(e)
        logger.warning("Page token non résolu pour page=%s : %s", page_id, msg)
        return user_token, False, msg


def list_page_posts(
    page_id: str, user_token: str, limit: int = 5
) -> list[dict[str, Any]]:
    token, _used_page_token, _token_error = _page_token_or_user(page_id, user_token)
    data, _reason = _fetch_posts(page_id, token, {"access_token": token, "limit": limit})
    return [_parse_post(row) for row in data.get("data", [])]


def get_page_post_summary(
    page_id: str, user_token: str, limit: int = 100
) -> dict[str, Any]:
    """Aggregate the page's recent posts: counts + likes/comments/shares totals,
    plus the top 3 posts by engagement. Everything from the real /posts edge.

    Dégradation gracieuse : si l'engagement est réellement indisponible, les posts
    se chargent quand même (engagement à 0) et `engagement_blocked_reason` porte la
    VRAIE raison Meta (token de page non résolu, scope manquant, token expiré…)."""
    token, used_page_token, token_error = _page_token_or_user(page_id, user_token)
    base = {"access_token": token, "limit": limit}
    # `summary=true` gives an exact total_count but is not supported on every
    # edge — fall back to a plain request and count what we fetched.
    try:
        data, reason = _fetch_posts(page_id, token, {**base, "summary": "true"})
    except GraphError:
        data, reason = _fetch_posts(page_id, token, base)
    posts = [_parse_post(row) for row in data.get("data", [])]

    # La VRAIE raison vient du chargement effectif de l'engagement sur /posts :
    # `reason` est autoritaire. Un échec de résolution du Page Token (`token_error`)
    # n'est ajouté qu'en CONTEXTE — car un token de page utilisé directement peut
    # très bien charger l'engagement même si /me/accounts a échoué (#100).
    engagement_blocked_reason: Optional[str]
    if reason and token_error:
        engagement_blocked_reason = (
            f"{reason} — résolution du Page Token : {token_error} "
            "(scopes requis : pages_read_engagement + pages_show_list)."
        )
    elif reason:
        engagement_blocked_reason = reason
    else:
        # Engagement chargé correctement → pas de blocage, même si on a dû recourir
        # à un token de repli (on le journalise seulement à titre informatif).
        if token_error:
            logger.info("Engagement chargé malgré la résolution token : %s", token_error)
        engagement_blocked_reason = None

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
        # bool conservé pour rétro-compatibilité ; la raison réelle est exposée à côté.
        "engagement_blocked": bool(engagement_blocked_reason),
        "engagement_blocked_reason": engagement_blocked_reason,
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


def create_page_photo_post(
    page_id: str,
    user_token: str,
    image_bytes: bytes,
    message: Optional[str] = None,
    filename: str = "upload.jpg",
) -> dict[str, Any]:
    """Publish a photo post (image + optional caption). Uses /{page-id}/photos
    with the uploaded bytes as `source`. Requires a Page Access Token."""
    page_token = resolve_page_token(user_token, page_id)
    data: dict[str, Any] = {"access_token": page_token}
    if message:
        data["message"] = message
    resp = requests.post(
        f"{GRAPH}/{page_id}/photos",
        data=data,
        files={"source": (filename, image_bytes)},
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
    except GraphError as e:
        # Fallback sur le token utilisateur (peut encore marcher pour certains
        # metrics) — mais on journalise la raison au lieu de l'avaler.
        logger.warning("Page token non résolu pour insights page=%s : %s", page_id, e)
        page_token = user_token

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


def _raw_error(resp: requests.Response) -> Optional[dict[str, Any]]:
    """Extrait l'objet `error` brut de Meta (message + code + subcode +
    error_user_msg) sans le tronquer comme le fait `_check`. Retourne None si la
    réponse est un succès JSON."""
    try:
        data = resp.json()
    except ValueError:
        return {"message": f"Réponse non JSON ({resp.status_code})", "raw": resp.text[:300]}
    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        return {
            "message": err.get("message"),
            "type": err.get("type"),
            "code": err.get("code"),
            "error_subcode": err.get("error_subcode"),
            "error_user_title": err.get("error_user_title"),
            "error_user_msg": err.get("error_user_msg"),
            "fbtrace_id": err.get("fbtrace_id"),
        }
    if not resp.ok:
        return {"message": resp.text[:300], "code": resp.status_code}
    return None


def diagnose_page_engagement(page_id: str, user_token: str) -> dict[str, Any]:
    """Utilitaire de diagnostic : à partir du token utilisateur, met en évidence
    la VRAIE cause de l'absence d'engagement (et non le faux message « App Review »).

    Retourne un dict structuré :
    - `accounts` : pages listées par /me/accounts, avec un booléen `has_token` par
      page (le token n'est jamais exposé en clair), et des flags pour la page cible.
    - `token_resolution` : a-t-on obtenu un Page Access Token, sinon pourquoi.
    - `posts_probe` : appel brut sur /{page}/posts avec les summaries d'engagement,
      utilisant le Page Access Token quand il est disponible. En cas d'erreur, le
      message Meta exact (code/subcode/error_user_msg) est remonté tel quel.
    """
    out: dict[str, Any] = {"page_id": page_id, "graph_version": GRAPH}

    # 0) /me — quel type de node ce token désigne-t-il ? Si me.id == page_id, le
    # token est DÉJÀ un Page Access Token (et non un token utilisateur).
    try:
        me = _check(requests.get(
            f"{GRAPH}/me",
            params={"access_token": user_token, "fields": "id,name"},
            timeout=TIMEOUT,
        ))
        out["token_identity"] = {
            "me_id": str(me.get("id")),
            "me_name": me.get("name"),
            "is_page_token": str(me.get("id")) == str(page_id),
        }
    except GraphError as e:
        out["token_identity"] = {"error": str(e)}

    # 1) /me/accounts — la page cible apparaît-elle, avec un access_token ?
    try:
        resp = requests.get(
            f"{GRAPH}/me/accounts",
            params={"access_token": user_token, "fields": "id,name,access_token"},
            timeout=TIMEOUT,
        )
        err = _raw_error(resp)
        if err:
            out["accounts"] = {"error": err}
        else:
            pages = resp.json().get("data", [])
            listed = [
                {
                    "id": str(p.get("id")),
                    "name": p.get("name"),
                    "has_token": bool(p.get("access_token")),
                }
                for p in pages
            ]
            target = next((p for p in listed if p["id"] == str(page_id)), None)
            out["accounts"] = {
                "count": len(listed),
                "pages": listed,
                "target_page_found": target is not None,
                "target_page_has_token": bool(target and target["has_token"]),
            }
    except requests.RequestException as e:
        out["accounts"] = {"error": {"message": f"Requête /me/accounts échouée : {e}"}}

    # 2) Résolution du Page Access Token (pour la sonde /posts).
    token, used_page_token, token_error = _page_token_or_user(page_id, user_token)
    out["token_resolution"] = {
        "used_page_token": used_page_token,
        "token_error": token_error,
    }

    # 3) Sonde brute /{page}/posts avec les summaries d'engagement.
    probe_fields = (
        "message,reactions.summary(total_count),"
        "comments.summary(total_count),shares"
    )
    try:
        resp = requests.get(
            f"{GRAPH}/{page_id}/posts",
            params={"access_token": token, "fields": probe_fields, "limit": 3},
            timeout=TIMEOUT,
        )
        err = _raw_error(resp)
        if err:
            out["posts_probe"] = {"ok": False, "error": err}
        else:
            rows = resp.json().get("data", [])
            out["posts_probe"] = {
                "ok": True,
                "sample_count": len(rows),
                "first_post": rows[0] if rows else None,
            }
    except requests.RequestException as e:
        out["posts_probe"] = {"ok": False, "error": {"message": f"Requête /posts échouée : {e}"}}

    return out
