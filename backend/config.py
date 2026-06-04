import os
import secrets

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL") or None
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get(
    "SUPABASE_JWT_SECRET"
) or secrets.token_urlsafe(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
