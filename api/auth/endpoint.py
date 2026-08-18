"""Logique des routes d'authentification (signup / login / refresh / logout / me)."""

from backend.auth import (
    login as auth_login,
    revoke_refresh_token,
    rotate_refresh_token,
    signup as auth_signup,
    update_user_profile,
)
from backend.schemas import (
    AuthResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    SignupRequest,
    UserPublic,
    UserUpdateRequest,
)


def signup(body: SignupRequest) -> AuthResponse:
    access, refresh, user = auth_signup(body.email, body.password, body.full_name)
    return AuthResponse(access_token=access, refresh_token=refresh, user=user)


def login(body: LoginRequest) -> AuthResponse:
    access, refresh, user, client_response = auth_login(body.email, body.password)
    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        user=user,
        client_response=client_response,
    )


def refresh(body: RefreshRequest) -> AuthResponse:
    """Renouvelle l'access token via un refresh token valide (rotation one-time use)."""
    access, refresh_token, user = rotate_refresh_token(body.refresh_token)
    return AuthResponse(access_token=access, refresh_token=refresh_token, user=user)


def logout(body: LogoutRequest) -> dict:
    """Invalide le refresh token courant côté serveur (déconnexion propre)."""
    revoke_refresh_token(body.refresh_token)
    return {"ok": True}


def me(user: UserPublic) -> UserPublic:
    return user


def update_me(body: UserUpdateRequest, user: UserPublic) -> UserPublic:
    patch = body.model_dump(exclude_unset=True)
    return update_user_profile(user.id, patch)
