"""Logique de gestion des comptes Meta (multi-clés) + test de connexion."""

from fastapi import HTTPException

from backend.db import (
    create_meta_account,
    delete_meta_account,
    get_meta_account,
    list_meta_accounts,
    set_default_meta_account,
    update_meta_account,
)
from backend.meta_tools import test_connection
from backend.schemas import (
    MetaAccountRequest,
    MetaAccountResponse,
    MetaTestResponse,
    UserPublic,
)
from api.common import mask_account


def list_accounts(user: UserPublic) -> list[MetaAccountResponse]:
    return [mask_account(a) for a in list_meta_accounts(user.id)]


def create_account(body: MetaAccountRequest, user: UserPublic) -> MetaAccountResponse:
    patch = body.model_dump(exclude_unset=True)
    make_default = patch.pop("is_default", None)
    acct = create_meta_account(user.id, patch)
    if make_default:
        acct = set_default_meta_account(user.id, acct["id"]) or acct
    return mask_account(acct)


def update_account(
    account_id: str, body: MetaAccountRequest, user: UserPublic
) -> MetaAccountResponse:
    patch = body.model_dump(exclude_unset=True)
    make_default = patch.pop("is_default", None)
    acct = update_meta_account(user.id, account_id, patch)
    if acct is None:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    if make_default:
        acct = set_default_meta_account(user.id, account_id) or acct
    return mask_account(acct)


def delete_account(account_id: str, user: UserPublic) -> dict:
    delete_meta_account(user.id, account_id)
    return {"ok": True}


def test_account(account_id: str, user: UserPublic) -> MetaTestResponse:
    acct = get_meta_account(user.id, account_id)
    if not acct or not acct.get("meta_access_token") or not acct.get("meta_ad_account_id"):
        return MetaTestResponse(ok=False, error="Token ou Ad Account ID manquant.")
    ok, info = test_connection(acct["meta_access_token"], acct["meta_ad_account_id"])
    if ok:
        return MetaTestResponse(ok=True, account_name=info)
    return MetaTestResponse(ok=False, error=info)
