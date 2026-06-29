-- ============================================================================
-- 0003_campaign_audit.sql — Audit-trail de création de campagne (review §5.2)
--
-- Ajoute à `campaigns` de quoi tracer AUSSI les échecs (pas seulement les succès)
-- et rendre la création idempotente :
--   status_detail : success | partial | failed
--   error_log     : message d'erreur Meta complet (debug/support)
--   request_id    : 1 création réelle par appel /chat (anti-doublon)
--
-- Idempotent et non destructif : sans effet si 0001 a déjà créé ces colonnes sur
-- une base neuve ; sert à mettre à niveau une base DÉJÀ déployée (où `campaigns`
-- existait sans ces colonnes).
-- ============================================================================

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status_detail TEXT;  -- success | partial | failed
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS error_log     TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS request_id    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_request_id_key
    ON campaigns(request_id) WHERE request_id IS NOT NULL;
