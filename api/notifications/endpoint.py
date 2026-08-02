"""Logique des notifications in-app."""

from backend import notifications
from backend.schemas import NotificationsResponse, UserPublic


def list_notifications(user: UserPublic) -> NotificationsResponse:
    return NotificationsResponse(**notifications.list_notifications(user.id))


def mark_all_read(user: UserPublic) -> dict:
    notifications.mark_all_read(user.id)
    return {"ok": True}


def mark_read(notification_id: str, user: UserPublic) -> dict:
    notifications.mark_read(user.id, notification_id)
    return {"ok": True}
