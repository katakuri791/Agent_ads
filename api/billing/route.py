"""Couche HTTP des routes Accès & Paiement (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.billing import endpoint
from api.deps import get_current_user
from backend.schemas import AccountUsersResponse, BillingResponse, UserPublic

router = APIRouter(tags=["billing"])


@router.get("/meta/account-users", response_model=AccountUsersResponse)
def account_users(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> AccountUsersResponse:
    return endpoint.account_users(user, account_id)


@router.get("/meta/billing", response_model=BillingResponse)
def billing(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> BillingResponse:
    return endpoint.billing(user, account_id)
