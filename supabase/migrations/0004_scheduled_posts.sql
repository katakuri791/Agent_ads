-- ============================================================================
-- 0004_scheduled_posts.sql — Historique persistant des posts planifiés
--
-- Meta retire un post planifié de l'arête `scheduled_posts` dès qu'il est publié,
-- et ne renvoie alors plus `scheduled_publish_time`. Résultat : l'historique
-- disparaît du calendrier dès qu'un post passe. On enregistre donc chaque
-- planification ici, à la création, pour que l'historique survive et s'affiche
-- (grisé) même après publication.
--
-- Le listing fusionne cette table (mémoire) avec les données live Meta.
-- Idempotent et non destructif (IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id      UUID REFERENCES meta_accounts(id) ON DELETE SET NULL,
    page_id         TEXT NOT NULL,
    meta_post_id    TEXT,                       -- id du post renvoyé par Meta
    type            TEXT NOT NULL DEFAULT 'text',-- text | image | video | link
    message         TEXT NOT NULL DEFAULT '',
    link            TEXT,
    full_picture    TEXT,
    scheduled_time  TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | published | deleted | failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lecture : tous les posts d'un utilisateur pour une page donnée, par date.
CREATE INDEX IF NOT EXISTS scheduled_posts_user_page_idx
    ON scheduled_posts(user_id, page_id, scheduled_time);

-- Fusion par meta_post_id (un post Meta = une ligne ici).
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_posts_meta_post_id_key
    ON scheduled_posts(meta_post_id) WHERE meta_post_id IS NOT NULL;

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;  -- accès backend via service-role
