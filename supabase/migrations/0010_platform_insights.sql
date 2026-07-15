-- ============================================================================
-- 0010_platform_insights.sql — Split Facebook / Instagram (toggle plateforme)
--
-- Le breakdown `publisher_platform` existant (fb_insights_breakdowns) ne porte
-- que impressions/clicks/spend/reach au niveau compte. Pour que l'Overview et la
-- liste des campagnes soient CORRECTS par plateforme (revenue, ROAS, conversions,
-- vidéo…), on synchronise les insights niveau ad ÉGALEMENT splittés par
-- plateforme, dans une table dédiée `fb_insights_platform_daily`.
--
-- On ne touche PAS fb_insights_daily (le mode « toutes plateformes » reste
-- inchangé → zéro régression). Le backend lit la table plateforme uniquement
-- quand un filtre plateforme est actif.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fb_insights_platform_daily (
    id                  BIGSERIAL PRIMARY KEY,
    ad_account_id       TEXT NOT NULL,
    ad_id               TEXT NOT NULL,
    adset_id            TEXT,
    campaign_id         TEXT,
    date                DATE NOT NULL,
    platform            TEXT NOT NULL,   -- facebook | instagram | audience_network | messenger
    spend               NUMERIC DEFAULT 0,
    impressions         BIGINT  DEFAULT 0,
    clicks              BIGINT  DEFAULT 0,
    reach               BIGINT  DEFAULT 0,
    frequency           NUMERIC DEFAULT 0,
    cpc                 NUMERIC DEFAULT 0,
    cpm                 NUMERIC DEFAULT 0,
    ctr                 NUMERIC DEFAULT 0,
    purchases           NUMERIC DEFAULT 0,
    revenue             NUMERIC DEFAULT 0,
    leads               NUMERIC DEFAULT 0,
    post_engagement     NUMERIC DEFAULT 0,
    messaging_started   NUMERIC DEFAULT 0,
    app_installs        NUMERIC DEFAULT 0,
    link_clicks         NUMERIC DEFAULT 0,
    landing_page_views  NUMERIC DEFAULT 0,
    inline_link_clicks  BIGINT  DEFAULT 0,
    unique_clicks       BIGINT  DEFAULT 0,
    outbound_clicks     NUMERIC DEFAULT 0,
    add_to_cart         NUMERIC DEFAULT 0,
    initiate_checkout   NUMERIC DEFAULT 0,
    post_reactions      NUMERIC DEFAULT 0,
    post_comments       NUMERIC DEFAULT 0,
    post_shares         NUMERIC DEFAULT 0,
    post_saves          NUMERIC DEFAULT 0,
    video_3s            NUMERIC DEFAULT 0,
    thruplays           NUMERIC DEFAULT 0,
    video_p25           NUMERIC DEFAULT 0,
    video_p50           NUMERIC DEFAULT 0,
    video_p75           NUMERIC DEFAULT 0,
    video_p100          NUMERIC DEFAULT 0,
    video_plays         NUMERIC DEFAULT 0,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ad_account_id, ad_id, date, platform)
);
CREATE INDEX IF NOT EXISTS idx_fb_plat_account_date
    ON fb_insights_platform_daily(ad_account_id, date, platform);
CREATE INDEX IF NOT EXISTS idx_fb_plat_campaign_date
    ON fb_insights_platform_daily(campaign_id, date, platform);

ALTER TABLE fb_insights_platform_daily ENABLE ROW LEVEL SECURITY;

-- ── Totaux compte pour UNE plateforme ────────────────────────────────────────
DROP FUNCTION IF EXISTS fb_summary_platform(TEXT, DATE, DATE, TEXT);
CREATE FUNCTION fb_summary_platform(p_account TEXT, p_start DATE, p_end DATE, p_platform TEXT)
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
        ROUND(COALESCE(SUM(impressions)::numeric / NULLIF(SUM(reach),0), 0), 4)
    FROM fb_insights_platform_daily
    WHERE ad_account_id = p_account AND platform = p_platform
      AND date BETWEEN p_start AND p_end;
$$;

-- ── 1 ligne par campagne pour UNE plateforme ─────────────────────────────────
DROP FUNCTION IF EXISTS fb_campaign_agg_platform(TEXT, DATE, DATE, TEXT);
CREATE FUNCTION fb_campaign_agg_platform(p_account TEXT, p_start DATE, p_end DATE, p_platform TEXT)
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
    JOIN fb_insights_platform_daily i
        ON i.campaign_id = c.id AND i.ad_account_id = c.ad_account_id
       AND i.platform = p_platform AND i.date BETWEEN p_start AND p_end
    WHERE c.ad_account_id = p_account
    GROUP BY c.id, c.name, c.objective, c.status, c.daily_budget;
$$;

-- ── Série quotidienne pour UNE plateforme ────────────────────────────────────
DROP FUNCTION IF EXISTS fb_timeseries_platform(TEXT, DATE, DATE, TEXT);
CREATE FUNCTION fb_timeseries_platform(p_account TEXT, p_start DATE, p_end DATE, p_platform TEXT)
RETURNS TABLE (
    date DATE, spend NUMERIC, impressions BIGINT, reach BIGINT, clicks BIGINT,
    conversions NUMERIC, revenue NUMERIC, ctr NUMERIC
) LANGUAGE sql STABLE AS $$
    SELECT
        i.date,
        COALESCE(SUM(i.spend),0)::numeric,
        COALESCE(SUM(i.impressions),0)::bigint,
        COALESCE(SUM(i.reach),0)::bigint,
        COALESCE(SUM(i.clicks),0)::bigint,
        COALESCE(SUM(i.purchases + i.leads),0)::numeric,
        COALESCE(SUM(i.revenue),0)::numeric,
        ROUND(COALESCE(SUM(i.clicks)::numeric / NULLIF(SUM(i.impressions),0) * 100, 0), 4)
    FROM fb_insights_platform_daily i
    WHERE i.ad_account_id = p_account AND i.platform = p_platform
      AND i.date BETWEEN p_start AND p_end
    GROUP BY i.date
    ORDER BY i.date;
$$;
