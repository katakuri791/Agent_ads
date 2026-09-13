-- ============================================================================
-- 0009_video_extended_metrics.sql — Métriques étendues + vidéo (sélecteur de
-- colonnes des campagnes).
--
-- Ajoute à fb_insights_daily les colonnes vidéo (vues 3 s, ThruPlay, quartiles
-- de complétion 25/50/75/100 %, lectures), les clics détaillés (link/uniques/
-- sortants) et le tunnel e-commerce + engagement social (add to cart, checkout,
-- réactions, commentaires, partages, saves). Toutes pré-extraites au sync
-- (backend/metrics.py + facebook_sync.py) → l'agrégation reste un simple SUM.
--
-- Puis recrée fb_summary et fb_campaign_agg pour SOMMER et exposer ces colonnes
-- (le frontend laisse l'utilisateur choisir quelles colonnes afficher).
-- ============================================================================

-- ── Nouvelles colonnes (DEFAULT 0 → non-breaking pour les lignes existantes) ──
ALTER TABLE fb_insights_daily
    ADD COLUMN IF NOT EXISTS inline_link_clicks BIGINT  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unique_clicks      BIGINT  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS outbound_clicks    NUMERIC DEFAULT 0,
    -- Tunnel e-commerce + engagement social
    ADD COLUMN IF NOT EXISTS add_to_cart        NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS initiate_checkout  NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS post_reactions     NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS post_comments      NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS post_shares        NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS post_saves         NUMERIC DEFAULT 0,
    -- Vidéo
    ADD COLUMN IF NOT EXISTS video_3s           NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS thruplays          NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS video_p25          NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS video_p50          NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS video_p75          NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS video_p100         NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS video_plays        NUMERIC DEFAULT 0;

-- ── fb_summary : ajoute les nouvelles sommes (recréation → DROP obligatoire car
--    la signature de retour change) ────────────────────────────────────────────
DROP FUNCTION IF EXISTS fb_summary(TEXT, DATE, DATE);
CREATE FUNCTION fb_summary(p_account TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, leads NUMERIC, post_engagement NUMERIC,
    messaging_started NUMERIC, app_installs NUMERIC, link_clicks NUMERIC,
    landing_page_views NUMERIC, ctr NUMERIC, cpc NUMERIC, cpm NUMERIC,
    inline_link_clicks NUMERIC, unique_clicks NUMERIC, outbound_clicks NUMERIC,
    add_to_cart NUMERIC, initiate_checkout NUMERIC, post_reactions NUMERIC,
    post_comments NUMERIC, post_shares NUMERIC, post_saves NUMERIC,
    video_3s NUMERIC, thruplays NUMERIC, video_p25 NUMERIC, video_p50 NUMERIC,
    video_p75 NUMERIC, video_p100 NUMERIC, video_plays NUMERIC, frequency NUMERIC
) LANGUAGE sql STABLE AS $$
    SELECT
        COALESCE(SUM(spend),0)::numeric,
        COALESCE(SUM(impressions),0)::bigint,
        COALESCE(SUM(clicks),0)::bigint,
        COALESCE(SUM(reach),0)::bigint,
        COALESCE(SUM(purchases),0)::numeric,
        COALESCE(SUM(revenue),0)::numeric,
        COALESCE(SUM(leads),0)::numeric,
        COALESCE(SUM(post_engagement),0)::numeric,
        COALESCE(SUM(messaging_started),0)::numeric,
        COALESCE(SUM(app_installs),0)::numeric,
        COALESCE(SUM(link_clicks),0)::numeric,
        COALESCE(SUM(landing_page_views),0)::numeric,
        ROUND(COALESCE(SUM(clicks)::numeric / NULLIF(SUM(impressions),0) * 100, 0), 4),
        ROUND(COALESCE(SUM(spend) / NULLIF(SUM(clicks),0), 0), 4),
        ROUND(COALESCE(SUM(spend) / NULLIF(SUM(impressions),0) * 1000, 0), 4),
        COALESCE(SUM(inline_link_clicks),0)::numeric,
        COALESCE(SUM(unique_clicks),0)::numeric,
        COALESCE(SUM(outbound_clicks),0)::numeric,
        COALESCE(SUM(add_to_cart),0)::numeric,
        COALESCE(SUM(initiate_checkout),0)::numeric,
        COALESCE(SUM(post_reactions),0)::numeric,
        COALESCE(SUM(post_comments),0)::numeric,
        COALESCE(SUM(post_shares),0)::numeric,
        COALESCE(SUM(post_saves),0)::numeric,
        COALESCE(SUM(video_3s),0)::numeric,
        COALESCE(SUM(thruplays),0)::numeric,
        COALESCE(SUM(video_p25),0)::numeric,
        COALESCE(SUM(video_p50),0)::numeric,
        COALESCE(SUM(video_p75),0)::numeric,
        COALESCE(SUM(video_p100),0)::numeric,
        COALESCE(SUM(video_plays),0)::numeric,
        -- Fréquence = impressions / reach (recalculée, jamais une moyenne de taux).
        ROUND(COALESCE(SUM(impressions)::numeric / NULLIF(SUM(reach),0), 0), 4)
    FROM fb_insights_daily
    WHERE ad_account_id = p_account AND date BETWEEN p_start AND p_end;
$$;

-- ── fb_campaign_agg : idem au niveau campagne ────────────────────────────────
DROP FUNCTION IF EXISTS fb_campaign_agg(TEXT, DATE, DATE);
CREATE FUNCTION fb_campaign_agg(p_account TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (
    id TEXT, name TEXT, objective TEXT, status TEXT, daily_budget NUMERIC,
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, leads NUMERIC, post_engagement NUMERIC,
    messaging_started NUMERIC, app_installs NUMERIC, link_clicks NUMERIC,
    landing_page_views NUMERIC, ctr NUMERIC, cpc NUMERIC, cpm NUMERIC,
    inline_link_clicks NUMERIC, unique_clicks NUMERIC, outbound_clicks NUMERIC,
    add_to_cart NUMERIC, initiate_checkout NUMERIC, post_reactions NUMERIC,
    post_comments NUMERIC, post_shares NUMERIC, post_saves NUMERIC,
    video_3s NUMERIC, thruplays NUMERIC, video_p25 NUMERIC, video_p50 NUMERIC,
    video_p75 NUMERIC, video_p100 NUMERIC, video_plays NUMERIC, frequency NUMERIC
) LANGUAGE sql STABLE AS $$
    SELECT
        c.id, c.name, c.objective, c.status, c.daily_budget,
        COALESCE(SUM(i.spend),0)::numeric,
        COALESCE(SUM(i.impressions),0)::bigint,
        COALESCE(SUM(i.clicks),0)::bigint,
        COALESCE(SUM(i.reach),0)::bigint,
        COALESCE(SUM(i.purchases),0)::numeric,
        COALESCE(SUM(i.revenue),0)::numeric,
        COALESCE(SUM(i.leads),0)::numeric,
        COALESCE(SUM(i.post_engagement),0)::numeric,
        COALESCE(SUM(i.messaging_started),0)::numeric,
        COALESCE(SUM(i.app_installs),0)::numeric,
        COALESCE(SUM(i.link_clicks),0)::numeric,
        COALESCE(SUM(i.landing_page_views),0)::numeric,
        ROUND(COALESCE(SUM(i.clicks)::numeric / NULLIF(SUM(i.impressions),0) * 100, 0), 4),
        ROUND(COALESCE(SUM(i.spend) / NULLIF(SUM(i.clicks),0), 0), 4),
        ROUND(COALESCE(SUM(i.spend) / NULLIF(SUM(i.impressions),0) * 1000, 0), 4),
        COALESCE(SUM(i.inline_link_clicks),0)::numeric,
        COALESCE(SUM(i.unique_clicks),0)::numeric,
        COALESCE(SUM(i.outbound_clicks),0)::numeric,
        COALESCE(SUM(i.add_to_cart),0)::numeric,
        COALESCE(SUM(i.initiate_checkout),0)::numeric,
        COALESCE(SUM(i.post_reactions),0)::numeric,
        COALESCE(SUM(i.post_comments),0)::numeric,
        COALESCE(SUM(i.post_shares),0)::numeric,
        COALESCE(SUM(i.post_saves),0)::numeric,
        COALESCE(SUM(i.video_3s),0)::numeric,
        COALESCE(SUM(i.thruplays),0)::numeric,
        COALESCE(SUM(i.video_p25),0)::numeric,
        COALESCE(SUM(i.video_p50),0)::numeric,
        COALESCE(SUM(i.video_p75),0)::numeric,
        COALESCE(SUM(i.video_p100),0)::numeric,
        COALESCE(SUM(i.video_plays),0)::numeric,
        ROUND(COALESCE(SUM(i.impressions)::numeric / NULLIF(SUM(i.reach),0), 0), 4)
    FROM fb_campaigns c
    LEFT JOIN fb_insights_daily i
        ON i.campaign_id = c.id AND i.ad_account_id = c.ad_account_id
       AND i.date BETWEEN p_start AND p_end
    WHERE c.ad_account_id = p_account
    GROUP BY c.id, c.name, c.objective, c.status, c.daily_budget;
$$;
