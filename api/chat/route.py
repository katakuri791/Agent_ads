"""Couche HTTP du chat / agent IA (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile

from api.chat import endpoint
from api.deps import get_current_user
from backend.schemas import (
    CampaignQuestionnaire,
    ChatImageUploadResponse,
    ChatRequest,
    ChatResponse,
    ChatVideoUploadResponse,
    UserPublic,
)

router = APIRouter(tags=["chat"])


@router.post("/chat/upload-image", response_model=ChatImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ChatImageUploadResponse:
    return await endpoint.upload_image(user, file, account_id)


@router.post("/chat/upload-video", response_model=ChatVideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ChatVideoUploadResponse:
    return await endpoint.upload_video(user, file, account_id)


@router.get("/chat/campaign-questionnaire", response_model=CampaignQuestionnaire)
def campaign_questionnaire(
    user: UserPublic = Depends(get_current_user),
) -> CampaignQuestionnaire:
    return endpoint.campaign_questionnaire()


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, user: UserPublic = Depends(get_current_user)) -> ChatResponse:
    return endpoint.chat(body, user)
