"""Couche HTTP des posts planifiés (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from api.deps import get_current_user
from api.scheduled_posts import endpoint
from backend.schemas import ScheduledPostsResponse, UserPublic

router = APIRouter(tags=["scheduled_posts"])


@router.get("/meta/scheduled-posts", response_model=ScheduledPostsResponse)
def list_scheduled_posts(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ScheduledPostsResponse:
    return endpoint.list_scheduled_posts(user, account_id)


@router.post("/meta/scheduled-posts")
async def create_scheduled_post(
    scheduled_time: str = Form(...),  # ISO 8601 ou epoch (secondes)
    message: str = Form(""),
    link: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    platform: str = Form("facebook"),       # "facebook" | "instagram"
    image_url: Optional[str] = Form(None),  # Instagram : URL HTTPS publique de l'image
    video_url: Optional[str] = Form(None),  # Instagram : URL HTTPS publique de la vidéo
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return await endpoint.create_scheduled_post(
        user, scheduled_time, message, link, image, video,
        platform, image_url, video_url, account_id,
    )


@router.post("/meta/scheduled-posts/{post_id}/publish")
def publish_scheduled_post(
    post_id: str,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.publish_scheduled_post(post_id, user, account_id)


@router.delete("/meta/scheduled-posts/{post_id}")
def delete_scheduled_post(
    post_id: str,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.delete_scheduled_post(post_id, user, account_id)
