"""Couche HTTP des routes d'authentification (délègue à `endpoint`)."""

from fastapi import APIRouter, Depends

from api.auth import endpoint
from api.deps import get_current_user
from backend.schemas import (
    AuthResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    SignupRequest,
    UserPublic,
    UserUpdateRequest,
)

router = APIRouter(tags=["auth"])


@router.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupRequest) -> AuthResponse:
    return endpoint.signup(body)


@router.post("/auth/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    return endpoint.login(body)


@router.post("/auth/refresh", response_model=AuthResponse)
def refresh(body: RefreshRequest) -> AuthResponse:
    return endpoint.refresh(body)


@router.post("/auth/logout")
def logout(body: LogoutRequest) -> dict:
    return endpoint.logout(body)


@router.get("/auth/me", response_model=UserPublic)
def me(user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return endpoint.me(user)


@router.patch("/auth/me", response_model=UserPublic)
def update_me(
    body: UserUpdateRequest, user: UserPublic = Depends(get_current_user)
) -> UserPublic:
    return endpoint.update_me(body, user)
