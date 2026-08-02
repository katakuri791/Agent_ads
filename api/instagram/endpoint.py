"""Logique de la route Instagram (profil + posts avec reach)."""

from typing import Optional

from backend import meta_instagram, meta_pages
from backend.schemas import IgPost, IgProfile, InstagramResponse, UserPublic
from api.common import meta_http_error
from api.deps import resolve_account


def get_instagram(
    user: UserPublic, limit: int, account_id: Optional[str]
) -> InstagramResponse:
    """Profil Instagram + posts récents avec leur portée (reach = « combien de
    gens ont vu »). L'IG est résolu depuis la Page Facebook du compte. Si aucun
    compte IG n'est lié / scope manquant → blocked_reason (aucune fausse donnée)."""
    settings = resolve_account(user.id, account_id, need_page=True)
    try:
        data = meta_instagram.get_overview(
            settings["meta_page_id"], settings["meta_access_token"], limit=limit
        )
    except meta_pages.GraphError as exc:
        # Erreur « attendue » (pas d'IG lié / scope) → 200 + raison pour un état UI clair.
        return InstagramResponse(profile=None, posts=[], blocked_reason=str(exc))
    except Exception as exc:
        raise meta_http_error(exc)
    return InstagramResponse(
        profile=IgProfile(**data["profile"]),
        posts=[IgPost(**p) for p in data["posts"]],
    )
