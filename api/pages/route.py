"""Couche HTTP des routes Page Facebook (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from api.deps import get_current_user
from api.pages import endpoint
from backend.schemas import PagePost, PageSummaryResponse, UserPublic

router = APIRouter(tags=["pages"])


@router.get("/meta/page-info")
def page_info(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.page_info(user, account_id)


@router.get("/meta/page-insights")
def page_insights(
    days: int = Query(28, ge=1, le=90),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.page_insights(user, days, account_id)


@router.get("/meta/page-posts", response_model=list[PagePost])
def page_posts(
    limit: int = Query(10, ge=1, le=25),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[PagePost]:
    return endpoint.page_posts(user, limit, account_id)


@router.get("/meta/page-summary", response_model=PageSummaryResponse)
def page_summary(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> PageSummaryResponse:
    return endpoint.page_summary(user, account_id)


@router.get("/meta/page-engagement-debug")
def page_engagement_debug(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.page_engagement_debug(user, account_id)


@router.get("/meta/page-best-times")
def page_best_times(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return endpoint.page_best_times(user, account_id)


@router.post("/meta/page-posts")
async def create_page_post(
    message: str = Form(""),
    link: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    return await endpoint.create_page_post(user, message, link, image, video, account_id)
