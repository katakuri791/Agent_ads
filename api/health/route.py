from fastapi import APIRouter

router = APIRouter(tags=["health"])


# Route triviale (aucune logique) → pas de endpoint.py dédié.
@router.get("/health")
def health() -> dict:
    return {"status": "ok"}
