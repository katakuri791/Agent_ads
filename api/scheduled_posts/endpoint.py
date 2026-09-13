"""Logique des posts planifiés (Facebook via Meta, Instagram via notre scheduler)."""

import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, UploadFile

from backend import meta_pages
from backend.db import (
    create_scheduled_post_record,
    list_scheduled_post_records,
    set_scheduled_post_status,
)
from backend.schemas import ScheduledPost, ScheduledPostsResponse, UserPublic
from api.common import meta_http_error
from api.deps import resolve_account

logger = logging.getLogger("metainsight")


def _merge_scheduled_posts(live: list[dict], records: list[dict]) -> list[dict]:
    """Fusionne les posts live Meta avec l'historique persisté (table scheduled_posts).

    Meta retire un post de l'arête `scheduled_posts` dès publication → on s'appuie
    sur la base pour ne pas perdre l'historique. Pour un post enregistré absent du
    live ET dont la date est passée : il a été publié → status='published' (grisé).
    """
    now = datetime.now(timezone.utc)
    by_id: dict[str, dict] = {}
    for p in live:
        if p.get("id"):
            by_id[str(p["id"])] = p

    for r in records:
        mid = r.get("meta_post_id")
        if mid and str(mid) in by_id:
            continue  # Meta est autoritaire sur les posts encore présents
        # Post connu de la base mais absent du live Meta.
        sched = r.get("scheduled_time")
        try:
            is_past = bool(sched) and datetime.fromisoformat(
                str(sched).replace("Z", "+00:00")
            ) <= now
        except (ValueError, TypeError):
            is_past = False
        # Une planification passée et disparue du live = publiée par Meta.
        status = "published" if (is_past or r.get("status") == "published") else "scheduled"
        if status == "published" and r.get("status") != "published" and mid:
            set_scheduled_post_status(str(mid), "published")  # persiste la transition
        synth = {
            "id": str(mid) if mid else f"local-{r.get('id')}",
            "message": r.get("message") or "",
            "type": r.get("type") or "text",
            "scheduled_time": sched,
            "created_time": r.get("created_at"),
            "permalink_url": None,
            "full_picture": r.get("full_picture"),
            "status": status,
        }
        by_id[synth["id"]] = synth

    merged = list(by_id.values())
    merged.sort(key=lambda p: p.get("scheduled_time") or "")
    return merged


def list_scheduled_posts(
    user: UserPublic, account_id: Optional[str]
) -> ScheduledPostsResponse:
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        posts, reason = meta_pages.list_scheduled_posts(
            settings["meta_page_id"], settings["meta_access_token"]
        )
    except Exception as exc:
        raise meta_http_error(exc)
    # `scheduled_posts` renvoie une liste vide SANS erreur quand pages_manage_posts
    # manque → on lève l'avertissement explicitement pour ne pas laisser un calendrier
    # vide silencieux (cause du post orphelin non supprimable).
    if not reason:
        scopes = meta_pages.list_token_scopes(settings["meta_access_token"])
        if scopes and "pages_manage_posts" not in scopes:
            reason = meta_pages.MANAGE_POSTS_MISSING
    # Fusion avec l'historique persisté : les posts déjà publiés restent visibles.
    records = list_scheduled_post_records(user.id, settings["meta_page_id"])
    posts = _merge_scheduled_posts(posts, records)
    return ScheduledPostsResponse(
        posts=[ScheduledPost(**p) for p in posts], blocked_reason=reason
    )


async def create_scheduled_post(
    user: UserPublic,
    scheduled_time: str,
    message: str,
    link: Optional[str],
    image: Optional[UploadFile],
    video: Optional[UploadFile],
    platform: str,
    image_url: Optional[str],
    video_url: Optional[str],
    account_id: Optional[str],
) -> dict:
    """Planifie un post sur Facebook (texte/lien/photo/vidéo) ou Instagram (URL media).
    Instagram : l'API IG Content Publishing exige une URL HTTPS publique."""
    settings = resolve_account(user.id, account_id, need_page=True)
    message = (message or "").strip()
    link = (link or "").strip() or None
    image_url = (image_url or "").strip() or None
    video_url = (video_url or "").strip() or None
    platform = (platform or "facebook").lower().strip()

    # Accepte un timestamp epoch (secondes) ou une date ISO 8601.
    raw = (scheduled_time or "").strip()
    try:
        ts = int(float(raw)) if raw.replace(".", "", 1).isdigit() else int(
            datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
        )
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Date de planification invalide.")

    if ts < int(time.time()) + 10 * 60:
        raise HTTPException(
            status_code=400,
            detail="La planification doit être au moins 10 minutes dans le futur (contrainte Meta).",
        )

    # ── Chemin Instagram ──────────────────────────────────────────────────────
    # Meta NE planifie PAS Instagram : on ne fait AUCUN appel Meta ici. On stocke
    # la demande (légende + URL média + type) et le job `ig_publish` la publie à
    # l'heure prévue (container + media_publish). Cf. meta_instagram.publish_ig_now.
    if platform == "instagram":
        media_url = video_url or image_url
        if not media_url:
            raise HTTPException(
                status_code=400,
                detail="Instagram nécessite l'URL HTTPS publique d'une image ou d'une vidéo.",
            )
        if not media_url.lower().startswith("https://"):
            raise HTTPException(
                status_code=400,
                detail="L'URL du média Instagram doit être en HTTPS et publiquement accessible.",
            )
        ig_media_type = "video" if video_url else "image"
        # Pour IG, la persistance EST l'opération (aucun appel Meta ici) → contrairement
        # au FB où elle est best-effort, un échec doit remonter une vraie erreur.
        record = create_scheduled_post_record(
            user.id,
            settings["meta_page_id"],
            meta_post_id=None,
            scheduled_time=datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
            post_type=ig_media_type,
            message=message,
            link=None,
            account_id=settings.get("id"),
            platform="instagram",
            ig_media_url=media_url,
            ig_media_type=ig_media_type,
        )
        if not record:
            raise HTTPException(
                status_code=500,
                detail="Impossible d'enregistrer la publication Instagram planifiée. Réessaie plus tard.",
            )
        return {"ok": True, "scheduled": True}

    # ── Chemin Facebook (comportement existant) ───────────────────────────────
    video_data = await video.read() if video is not None else b""
    if video_data and len(video_data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Vidéo trop lourde (>200 Mo).")
    image_data = await image.read() if image is not None else b""
    if image_data and len(image_data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (>30 Mo).")
    if not message and not image_data and not video_data:
        raise HTTPException(status_code=400, detail="Un message, une image ou une vidéo est requis.")

    try:
        meta_pages.ensure_can_manage_posts(settings["meta_access_token"])
    except meta_pages.GraphError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        result = meta_pages.create_scheduled_post(
            settings["meta_page_id"],
            settings["meta_access_token"],
            message,
            ts,
            link=link,
            image_bytes=image_data or None,
            video_bytes=video_data or None,
            filename=(video.filename if video else None) or (image.filename if image else None) or "upload",
        )
    except Exception as exc:
        raise meta_http_error(exc)
    post_id = result.get("post_id") or result.get("id")
    post_type = "video" if video_data else "image" if image_data else "link" if link else "text"
    create_scheduled_post_record(
        user.id,
        settings["meta_page_id"],
        meta_post_id=str(post_id) if post_id else None,
        scheduled_time=datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
        post_type=post_type,
        message=message,
        link=link,
        account_id=settings.get("id"),
    )
    return {"ok": True, "post_id": post_id}


def publish_scheduled_post(
    post_id: str, user: UserPublic, account_id: Optional[str]
) -> dict:
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        meta_pages.publish_scheduled_post(
            post_id, settings["meta_access_token"], settings["meta_page_id"]
        )
    except Exception as exc:
        raise meta_http_error(exc)
    set_scheduled_post_status(post_id, "published")  # garde l'historique grisé
    return {"ok": True}


def delete_scheduled_post(
    post_id: str, user: UserPublic, account_id: Optional[str]
) -> dict:
    settings = resolve_account(user.id, account_id, need_page=True)
    # Message clair si le scope manque (sinon Meta renvoie un subcode 33 cryptique).
    try:
        meta_pages.ensure_can_manage_posts(settings["meta_access_token"])
    except meta_pages.GraphError as exc:
        # On retire quand même de NOTRE calendrier (le post côté Meta reste un
        # orphelin non supprimable tant que le scope n'est pas accordé).
        set_scheduled_post_status(post_id, "deleted")
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        meta_pages.delete_scheduled_post(
            post_id, settings["meta_access_token"], settings["meta_page_id"]
        )
    except Exception as exc:
        raise meta_http_error(exc)
    set_scheduled_post_status(post_id, "deleted")  # retiré de l'historique
    return {"ok": True}
