-- Notifications in-app (alertes : sync échoué, campagne ratée, token expiré).
-- Aucune dépendance email / service tiers : le backend insère, le frontend
-- interroge (cloche topbar + polling 60s).
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- 'sync_error' | 'campaign_failed' | 'token_expired'
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
