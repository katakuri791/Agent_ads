"""Couche HTTP du sync (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.deps import get_current_user
from api.sync import endpoint
from backend.schemas import SyncStatusResponse, UserPublic

router = APIRouter(tags=["sync"])


@router.post("/api/sync/{account_id}", response_model=SyncStatusResponse)
async def sync_account(
    account_id: str, user: UserPublic = Depends(get_current_user)
) -> SyncStatusResponse:
    return await endpoint.sync_account(account_id, user)


@router.get("/api/sync/status", response_model=SyncStatusResponse)
def sync_status(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> SyncStatusResponse:
    return endpoint.sync_status(user, account_id)
