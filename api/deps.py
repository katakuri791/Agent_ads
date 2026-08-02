"""Dépendances FastAPI transverses (injection d'auth + résolution de compte Meta).

`get_current_user` est re-exporté ici pour que les features l'importent depuis
un seul point (`api.deps`) plutôt que d'atteindre `backend.auth` directement.
"""

from typing import Optional

from fastapi import HTTPException

from backend.auth import get_current_user  # re-export (point d'import unique)
from backend.db import get_meta_account

__all__ = ["get_current_user", "resolve_account"]


def resolve_account(
    user_id: str,
    account_id: Optional[str] = None,
    need_account: bool = False,
    need_page: bool = False,
) -> dict:
    """Résout le compte Meta sélectionné (multi-clés) et valide les credentials
    requis par la route. Remplace l'ancien `_require_meta_settings` mono-compte."""
    acct = get_meta_account(user_id, account_id)
    if not acct or not acct.get("meta_access_token"):
        raise HTTPException(status_code=400, detail="Meta access token is required.")
    if need_account and not acct.get("meta_ad_account_id"):
        raise HTTPException(status_code=400, detail="Meta ad account id is required.")
    if need_page and not acct.get("meta_page_id"):
        raise HTTPException(status_code=400, detail="Meta page id is required.")
    return acct
