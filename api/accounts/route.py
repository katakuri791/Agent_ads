"""Couche HTTP des comptes Meta (multi-clés) — délègue à `endpoint`."""

from fastapi import APIRouter, Depends

from api.accounts import endpoint
from api.deps import get_current_user
from backend.schemas import (
    MetaAccountRequest,
    MetaAccountResponse,
    MetaTestResponse,
    UserPublic,
)

router = APIRouter(tags=["accounts"])


@router.get("/meta/accounts", response_model=list[MetaAccountResponse])
def list_accounts(
    user: UserPublic = Depends(get_current_user),
) -> list[MetaAccountResponse]:
    return endpoint.list_accounts(user)


@router.post("/meta/accounts", response_model=MetaAccountResponse)
def create_account(
    body: MetaAccountRequest, user: UserPublic = Depends(get_current_user)
) -> MetaAccountResponse:
    return endpoint.create_account(body, user)


@router.put("/meta/accounts/{account_id}", response_model=MetaAccountResponse)
def update_account(
    account_id: str,
    body: MetaAccountRequest,
    user: UserPublic = Depends(get_current_user),
) -> MetaAccountResponse:
    return endpoint.update_account(account_id, body, user)


@router.delete("/meta/accounts/{account_id}")
def delete_account(
    account_id: str, user: UserPublic = Depends(get_current_user)
) -> dict:
    return endpoint.delete_account(account_id, user)


@router.post("/meta/accounts/{account_id}/test", response_model=MetaTestResponse)
def test_account(
    account_id: str, user: UserPublic = Depends(get_current_user)
) -> MetaTestResponse:
    return endpoint.test_account(account_id, user)
