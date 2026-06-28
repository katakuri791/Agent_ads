-- Date de création des campagnes (created_time Meta).
-- Le sync ne récupérait que start_time/stop_time (start_time parfois epoch 0
-- = 1969 quand Meta ne renvoie rien). created_time est la vraie date de
-- création, exposée dans le détail campagne. Additif, non destructif.
ALTER TABLE fb_campaigns ADD COLUMN IF NOT EXISTS created_time timestamptz;

-- fb_campaign_agg renvoie désormais created_time (DROP requis : changement de
-- type de retour interdit par CREATE OR REPLACE).
DROP FUNCTION IF EXISTS fb_campaign_agg(text, date, date);
CREATE FUNCTION fb_campaign_agg(p_account TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (
    id TEXT, name TEXT, objective TEXT, status TEXT, daily_budget NUMERIC,
    created_time TIMESTAMPTZ,
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, leads NUMERIC, post_engagement NUMERIC,
    messaging_started NUMERIC, app_installs NUMERIC, link_clicks NUMERIC,
    landing_page_views NUMERIC, ctr NUMERIC, cpc NUMERIC, cpm NUMERIC
) LANGUAGE sql STABLE AS $$
    SELECT
        c.id, c.name, c.objective, c.status, c.daily_budget,
        c.created_time,
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
        ROUND(COALESCE(SUM(i.spend) / NULLIF(SUM(i.impressions),0) * 1000, 0), 4)
    FROM fb_campaigns c
    LEFT JOIN fb_insights_daily i
        ON i.campaign_id = c.id AND i.ad_account_id = c.ad_account_id
       AND i.date BETWEEN p_start AND p_end
    WHERE c.ad_account_id = p_account
    GROUP BY c.id, c.name, c.objective, c.status, c.daily_budget, c.created_time;
$$;
