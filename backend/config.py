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

# ─── Table Creative Ideas (SmartDB NocoDB) ───────────────────────────────────
CREATIVE_IDEAS_TABLE_URL = os.environ.get(
    "CREATIVE_IDEAS_TABLE_URL",
    "https://api.tybotflow.com/api/v1/smart-db/tables/myqgf3eub7f7gtf/records",
)
CREATIVE_IDEAS_API_KEY = os.environ.get("CREATIVE_IDEAS_API_KEY", "")

# Anciennes variables Supabase — conservées optionnelles (plus requises au boot).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL") or None
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get(
    "SUPABASE_JWT_SECRET"
) or secrets.token_urlsafe(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24

# ─── Clé d'API statique pour intégrateurs externes (Botpress) ─────────────────
# Permet d'appeler /chat et /conversations sans JWT, via le header `X-API-Key`.
# Quand la clé est présente et valide, la requête agit AU NOM de l'utilisateur
# `CHAT_API_USER_ID` (le user de test id=5 par défaut) → mêmes conversations et
# même compte Meta que cet utilisateur. Si `CHAT_API_KEY` est vide, la clé d'API
# est désactivée (seul le JWT fonctionne). Voir backend/auth.get_user_or_api_key.
CHAT_API_KEY = os.environ.get("CHAT_API_KEY", "")
CHAT_API_USER_ID = os.environ.get("CHAT_API_USER_ID", "5")

# ─── Login délégué à la plateforme du client (tybotflow) ──────────────────────
# /auth/login n'authentifie PLUS contre notre table `users` locale : il appelle
# l'endpoint de login du client (email + mot de passe). Si l'appel réussit,
# l'utilisateur est rattaché en local PAR SON EMAIL (créé s'il n'existe pas) puis
# on émet NOTRE JWT habituel → le frontend et les 50 routes restent inchangés.
# L'URL du client est la valeur par défaut (ce n'est pas un secret) : ça marche
# directement, sans configuration. On peut la surcharger via `.env` (ou la vider
# pour revenir au login 100 % local).
# CLIENT_AUTH_TOKEN = token de service éventuel exigé par l'endpoint du client
# (en-tête `Authorization: Bearer …`). Vide si l'endpoint n'en demande pas — c'est
# un SECRET, donc jamais en dur ici : à mettre dans `.env` uniquement si besoin.
CLIENT_AUTH_URL = os.environ.get(
    "CLIENT_AUTH_URL", "https://api.tybotflow.com/api/v1/auth/login"
)
CLIENT_AUTH_TOKEN = os.environ.get("CLIENT_AUTH_TOKEN", "")

# Observabilité — Sentry. Vide en dev local (init désactivée, aucun appel réseau).
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
ENV = os.environ.get("ENV", "development")

# Rate limiter partagé (multi-worker). Si Redis est injoignable, le limiteur passe
# en mode dégradé (fail-open) — cf. backend/ratelimit.py.
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Origine du FRONTEND de production (la page que le navigateur charge et qui
    # appelle l'API) → c'est CELLE-CI qui doit être autorisée, sinon le navigateur
    # bloque les appels. On garde aussi l'origine de l'API (inoffensif).
    "https://metaads.tybotflow.com",
    "https://metaads-api.tybotflow.com",
]

# `supabase_admin` garde son nom pour ne rien changer aux 60 sites d'appel, mais
# c'est désormais l'adaptateur SmartDB. La construction ne fait aucun appel réseau
# (sûr à l'import) : une clé manquante n'échoue qu'au premier appel réel.
supabase_admin = SmartDBClient(
    base_url=SMARTDB_BASE_URL,
    api_key=SMARTDB_API_KEY,
    base_id=SMARTDB_BASE_ID,
)
