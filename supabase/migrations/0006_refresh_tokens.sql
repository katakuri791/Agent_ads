-- Refresh tokens (sessions longues, rotation one-time use).
-- L'access token JWT expire en 24h ; le refresh token (30j) permet de le
-- renouveler silencieusement sans reconnexion. Chaque refresh token ne sert
-- qu'une fois (rotation) : utilisé → supprimé → nouveau émis.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- RLS activé sans policy : seul le backend (service-role) y accède (cf. autres tables).
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
