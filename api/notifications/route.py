"""Couche HTTP des notifications in-app (délègue à `endpoint`)."""

from fastapi import APIRouter, Depends

from api.deps import get_current_user
from api.notifications import endpoint
from backend.schemas import NotificationsResponse, UserPublic

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=NotificationsResponse)
def list_notifications(
    user: UserPublic = Depends(get_current_user),
) -> NotificationsResponse:
    return endpoint.list_notifications(user)


@router.patch("/notifications/read-all")
def read_all(user: UserPublic = Depends(get_current_user)) -> dict:
    return endpoint.mark_all_read(user)


@router.patch("/notifications/{notification_id}")
def read_one(
    notification_id: str, user: UserPublic = Depends(get_current_user)
) -> dict:
    return endpoint.mark_read(notification_id, user)
