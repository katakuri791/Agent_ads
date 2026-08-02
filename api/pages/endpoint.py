"""Logique des routes Page Facebook (infos, insights, posts, publication…)."""

import logging
from typing import Optional

from fastapi import HTTPException, UploadFile

from backend import meta_pages
from backend.schemas import PagePost, PageSummaryResponse, UserPublic
from api.common import meta_http_error
from api.deps import resolve_account

logger = logging.getLogger("metainsight")


def page_info(user: UserPublic, account_id: Optional[str]) -> dict:
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        info = meta_pages.get_page_info(settings["meta_page_id"], settings["meta_access_token"])
    except Exception as exc:
        raise meta_http_error(exc)
    return {
        "name": info.get("name"),
        "category": info.get("category"),
        "fan_count": info.get("fan_count"),
        "followers_count": info.get("followers_count"),
        "link": info.get("link"),
        "picture_url": info.get("picture_url"),
        "about": info.get("about"),
        "website": info.get("website"),
    }


def page_insights(user: UserPublic, days: int, account_id: Optional[str]) -> dict:
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        stats = meta_pages.get_page_insights(
            settings["meta_page_id"], settings["meta_access_token"], days=days
        )
    except Exception as exc:
        raise meta_http_error(exc)
    return {"days": days, **stats}


def page_posts(user: UserPublic, limit: int, account_id: Optional[str]) -> list[PagePost]:
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        posts = meta_pages.list_page_posts(
            settings["meta_page_id"], settings["meta_access_token"], limit=limit
        )
    except Exception as exc:
        raise meta_http_error(exc)
    return [PagePost(**p) for p in posts]


def page_summary(user: UserPublic, account_id: Optional[str]) -> PageSummaryResponse:
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        summary = meta_pages.get_page_post_summary(
            settings["meta_page_id"], settings["meta_access_token"], limit=50
        )
    except Exception as exc:
        raise meta_http_error(exc)
    # Page-level reach (total / organic / paid) — best-effort, never blocks the
    # rest of the page (returns zeros if Meta deprecated the metric).
    try:
        stats = meta_pages.get_page_insights(
            settings["meta_page_id"], settings["meta_access_token"], days=28
        )
        summary["reach_total"] = stats.get("reach_total", 0)
        summary["reach_organic"] = stats.get("reach_organic", 0)
        summary["reach_paid"] = stats.get("reach_paid", 0)
    except Exception:
        logger.warning("page-summary reach metrics unavailable", exc_info=True)
    return PageSummaryResponse(**summary)


def page_engagement_debug(user: UserPublic, account_id: Optional[str]) -> dict:
    """Endpoint de diagnostic : remonte la VRAIE cause de l'absence d'engagement
    (token de page non résolu, scope manquant, token expiré…) au lieu du faux
    message « App Review ». Affiche /me/accounts (la page cible a-t-elle un token ?)
    et la sonde brute /{page}/posts avec le message Meta exact (code/subcode)."""
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        return meta_pages.diagnose_page_engagement(
            settings["meta_page_id"], settings["meta_access_token"]
        )
    except Exception as exc:
        raise meta_http_error(exc)


def page_best_times(user: UserPublic, account_id: Optional[str]) -> dict:
    """Activité réelle des abonnés de la Page par heure (meilleur moment de publication)."""
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        return meta_pages.get_fans_online_by_hour(
            settings["meta_page_id"], settings["meta_access_token"]
        )
    except Exception as exc:
        raise meta_http_error(exc)


async def create_page_post(
    user: UserPublic,
    message: str,
    link: Optional[str],
    image: Optional[UploadFile],
    video: Optional[UploadFile],
    account_id: Optional[str],
) -> dict:
    """Publie un post sur la page Facebook de l'utilisateur (texte, lien, photo ou
    vidéo + légende). La publication est immédiate et irréversible.
    Précédence du média : vidéo > image > texte."""
    settings = resolve_account(user.id, account_id, need_page=True)
    message = (message or "").strip()
    link = (link or "").strip() or None

    video_data = await video.read() if video is not None else b""
    if video_data and len(video_data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Vidéo trop lourde (>200 Mo).")
    image_data = await image.read() if image is not None else b""
    if image_data and len(image_data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (>30 Mo).")
    if not message and not image_data and not video_data:
        raise HTTPException(status_code=400, detail="Un message, une image ou une vidéo est requis.")

    try:
        if video_data:
            result = meta_pages.create_page_video_post(
                settings["meta_page_id"],
                settings["meta_access_token"],
                video_data,
                message=message or None,
                filename=video.filename or "video.mp4",
            )
        elif image_data:
            result = meta_pages.create_page_photo_post(
                settings["meta_page_id"],
                settings["meta_access_token"],
                image_data,
                message=message or None,
                filename=image.filename or "upload.jpg",
            )
        else:
            result = meta_pages.create_page_post(
                settings["meta_page_id"],
                settings["meta_access_token"],
                message,
                link=link,
            )
    except Exception as exc:
        raise meta_http_error(exc)

    post_id = result.get("post_id") or result.get("id")
    return {"ok": True, "post_id": post_id}
