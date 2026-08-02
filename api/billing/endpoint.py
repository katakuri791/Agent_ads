"""Logique des routes Accès & Paiement (account_users + billing)."""

import logging
from typing import Optional

from backend import dashboard, meta_pages
from backend.schemas import (
    AccountUser,
    AccountUsersResponse,
    BillingResponse,
    UserPublic,
)
from api.common import meta_http_error
from api.deps import resolve_account

logger = logging.getLogger("metainsight")


def account_users(user: UserPublic, account_id: Optional[str]) -> AccountUsersResponse:
    """Personnes ayant accès au compte publicitaire Meta + leur rôle réel.
    Requiert le scope `business_management` sur le token → sinon on remonte la
    raison Meta exacte (aucune liste inventée)."""
    settings = resolve_account(user.id, account_id, need_account=True)
    try:
        users = meta_pages.account_users(
            settings["meta_ad_account_id"], settings["meta_access_token"]
        )
    except meta_pages.GraphError as exc:
        # Erreur « attendue » (accès refusé / permission manquante) → 200 avec un
        # message clair et lisible (pas l'erreur technique brute de Meta).
        logger.info("account_users blocked: %s", exc)
        return AccountUsersResponse(users=[], blocked_reason=meta_pages.ACCESS_BLOCKED_MSG)
    except Exception as exc:
        raise meta_http_error(exc)
    return AccountUsersResponse(users=[AccountUser(**u) for u in users])


def billing(user: UserPublic, account_id: Optional[str]) -> BillingResponse:
    """Type de paiement + solde/dépense/seuil du compte pub Meta + historique de
    dépense mensuel (reconstruit depuis les vraies dépenses du cache)."""
    settings = resolve_account(user.id, account_id, need_account=True)
    try:
        billing_data = meta_pages.account_billing(
            settings["meta_ad_account_id"], settings["meta_access_token"]
        )
    except Exception as exc:
        raise meta_http_error(exc)
    try:
        history = dashboard.monthly_spend(settings["meta_ad_account_id"])
    except Exception:
        history = []
    return BillingResponse(**billing_data, history=history)
