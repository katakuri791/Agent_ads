-- ============================================================================
-- 0001_core_schema.sql — Schéma applicatif de base (auth, chat, audit campagnes)
--
-- Jusqu'ici ce schéma n'existait QUE dans la doc (README.md / CLAUDE.md) : la
-- base distante avait été créée à la main, sans migration. Ce fichier le rend
-- reproductible (nouvel environnement, CI, reset local) sans rien casser sur la
-- base déjà déployée : tout est `IF NOT EXISTS` / non destructif.
--
-- Auth : l'app utilise un JWT custom (HS256 + bcrypt, cf. backend/auth.py), PAS
-- Supabase Auth. `auth.uid()` n'est donc jamais peuplé. Comme pour 0002_fb_cache,
-- on active RLS SANS policy : le backend accède via la service-role key (bypass
-- RLS) et le frontend ne lit JAMAIS les tables en direct (il passe par l'API
-- FastAPI). RLS sans policy = deny-all pour les rôles anon/authenticated, ce qui
-- est exactement le verrou voulu. Le scoping par utilisateur est assuré côté API.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ── Comptes utilisateurs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT,
    first_name    TEXT,
    last_name     TEXT,
    avatar_url    TEXT,
    company       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Paramètres Meta (modèle mono-clé hérité, déprécié mais encore lu) ────────
CREATE TABLE IF NOT EXISTS user_settings (
    user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    meta_access_token  TEXT,
    meta_ad_account_id TEXT,
    meta_page_id       TEXT,
    meta_pixel_id      TEXT,
    preferred_currency TEXT,
    timezone           TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Comptes Meta multi-clés (modèle courant) ────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_accounts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label              TEXT,
    meta_access_token  TEXT,
    meta_ad_account_id TEXT,
    meta_page_id       TEXT,
    meta_pixel_id      TEXT,
    preferred_currency TEXT,
    timezone           TEXT,
    is_default         BOOLEAN DEFAULT FALSE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);
-- Un seul compte par défaut par utilisateur.
CREATE UNIQUE INDEX IF NOT EXISTS meta_accounts_one_default
    ON meta_accounts(user_id) WHERE is_default;

-- ── Conversations & messages (chat agent) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,   -- user | assistant | tool | system
    content         TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);

-- ── Observabilité : log des appels d'outils de l'agent ──────────────────────
CREATE TABLE IF NOT EXISTS tool_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    tool_name       TEXT,
    tool_input      JSONB,
    tool_output     TEXT,
    status          TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tool_logs_user_idx ON tool_logs(user_id);

-- ── Audit-trail des campagnes créées par l'agent ────────────────────────────
-- Les colonnes status_detail / error_log / request_id tracent AUSSI les échecs
-- (review §5.2). Sur une base déjà déployée, 0003 les ajoute via ALTER.
CREATE TABLE IF NOT EXISTS campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meta_campaign_id TEXT,
    name             TEXT,
    objective        TEXT,
    status           TEXT DEFAULT 'PAUSED',
    daily_budget     NUMERIC,
    status_detail    TEXT,            -- success | partial | failed
    error_log        TEXT,
    request_id       TEXT,            -- idempotence (1 création réelle par /chat)
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_request_id_key
    ON campaigns(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaigns_user_idx ON campaigns(user_id);

CREATE TABLE IF NOT EXISTS ad_sets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id       UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    meta_ad_set_id    TEXT,
    name              TEXT,
    status            TEXT DEFAULT 'PAUSED',
    daily_budget      NUMERIC,
    optimization_goal TEXT,
    billing_event     TEXT,
    targeting         JSONB DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_set_id   UUID REFERENCES ad_sets(id) ON DELETE CASCADE,
    meta_ad_id  TEXT,
    name        TEXT,
    status      TEXT DEFAULT 'PAUSED',
    creative_id TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS : activée sans policy (cf. en-tête). Backend = service-role (bypass). ─
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_sets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads           ENABLE ROW LEVEL SECURITY;
