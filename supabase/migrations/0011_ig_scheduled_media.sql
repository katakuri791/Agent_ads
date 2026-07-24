-- ============================================================================
-- 0011_ig_scheduled_media.sql — Planification Instagram côté serveur
--
-- Meta NE planifie PAS les publications Instagram (scheduled_publish_time /
-- published=false n'existent que pour le fil d'une Page Facebook). L'API IG
-- « Content Publishing » ne connaît que : créer un conteneur → media_publish.
-- Un conteneur expire d'ailleurs sous 24 h → impossible de « créer maintenant,
-- publier plus tard ».
--
-- On planifie donc NOUS-MÊMES : à la création on ne fait AUCUN appel Meta, on
-- stocke seulement la demande (légende déjà en `message`, + l'URL média et son
-- type ci-dessous). Un job APScheduler (`ig_publish`, main.py) publie ensuite
-- les posts dus à l'heure prévue et met `status` à `published` / `failed`.
--
-- Colonnes ajoutées à `scheduled_posts`. Idempotent (IF NOT EXISTS).
-- ⚠️ SmartDB (client) : NocoDB n'exécute pas ce SQL — ajouter ces 3 colonnes
--    via l'API `POST /smart-db/tables/{tableId}/columns` (platform TEXT défaut
--    'facebook', ig_media_url TEXT, ig_media_type TEXT).
-- ============================================================================

ALTER TABLE scheduled_posts
    ADD COLUMN IF NOT EXISTS platform      TEXT NOT NULL DEFAULT 'facebook';  -- facebook | instagram

ALTER TABLE scheduled_posts
    ADD COLUMN IF NOT EXISTS ig_media_url  TEXT;   -- URL HTTPS publique (image ou vidéo)

ALTER TABLE scheduled_posts
    ADD COLUMN IF NOT EXISTS ig_media_type TEXT;   -- image | video (REELS)

-- Lecture du job de publication : les posts IG encore à publier, par échéance.
CREATE INDEX IF NOT EXISTS scheduled_posts_due_ig_idx
    ON scheduled_posts(platform, status, scheduled_time);
