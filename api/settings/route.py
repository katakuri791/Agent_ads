"""Couche HTTP des réglages Meta (délègue à `endpoint`)."""

from fastapi import APIRouter, Depends

from api.deps import get_current_user
from api.settings import endpoint
from backend.schemas import (
    MetaSettingsRequest,
    MetaSettingsResponse,
    MetaTestResponse,
    UserPublic,
)

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=MetaSettingsResponse)
def get_settings(user: UserPublic = Depends(get_current_user)) -> MetaSettingsResponse:
    return endpoint.get_settings(user)


@router.put("/settings", response_model=MetaSettingsResponse)
def put_settings(
    body: MetaSettingsRequest, user: UserPublic = Depends(get_current_user)
) -> MetaSettingsResponse:
    return endpoint.put_settings(body, user)


@router.post("/settings/test", response_model=MetaTestResponse)
def test_settings(user: UserPublic = Depends(get_current_user)) -> MetaTestResponse:
    return endpoint.test_settings(user)
