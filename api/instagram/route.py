"""Couche HTTP de la route Instagram (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.deps import get_current_user
from api.instagram import endpoint
from backend.schemas import InstagramResponse, UserPublic

router = APIRouter(tags=["instagram"])


@router.get("/meta/instagram", response_model=InstagramResponse)
def get_instagram(
    limit: int = Query(24, ge=1, le=50),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> InstagramResponse:
    return endpoint.get_instagram(user, limit, account_id)
