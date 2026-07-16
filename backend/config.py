import os
import secrets

from dotenv import load_dotenv

from .smartdb import SmartDBClient

load_dotenv()

# ─── SmartDB (API REST tybotflow) — remplace Supabase côté client ─────────────
# Le client livre une base SmartDB (NocoDB) et non Supabase. On lit désormais les
# données via l'API REST SmartDB. Voir backend/smartdb.py.
SMARTDB_BASE_URL = os.environ.get("SMARTDB_BASE_URL", "https://api.tybotflow.com/api/v1")
SMARTDB_API_KEY = os.environ.get("SMARTDB_API_KEY", "")
SMARTDB_BASE_ID = os.environ.get("SMARTDB_BASE_ID", "pmrlw1xde7g9e")

# Anciennes variables Supabase — conservées optionnelles (plus requises au boot).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL") or None
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get(
    "SUPABASE_JWT_SECRET"
) or secrets.token_urlsafe(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24

# Observabilité — Sentry. Vide en dev local (init désactivée, aucun appel réseau).
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
ENV = os.environ.get("ENV", "development")

# Rate limiter partagé (multi-worker). Si Redis est injoignable, le limiteur passe
# en mode dégradé (fail-open) — cf. backend/ratelimit.py.
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Origine du frontend de production (le navigateur y sert la page qui
    # appelle l'API sur api.metaads.tybotflow.com) → doit être autorisée.
    "https://metaads.tybotflow.com",
]

# `supabase_admin` garde son nom pour ne rien changer aux 60 sites d'appel, mais
# c'est désormais l'adaptateur SmartDB. La construction ne fait aucun appel réseau
# (sûr à l'import) : une clé manquante n'échoue qu'au premier appel réel.
supabase_admin = SmartDBClient(
    base_url=SMARTDB_BASE_URL,
    api_key=SMARTDB_API_KEY,
    base_id=SMARTDB_BASE_ID,
)
