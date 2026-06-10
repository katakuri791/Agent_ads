-- ============================================================================
-- 0002_fb_cache.sql — Cache analytics Meta Ads (sync background → Supabase)
--
-- Le dashboard lisait Meta en direct (lent, rate-limit). On introduit un cache
-- alimenté par un worker (backend/facebook_sync.py) et lu par des endpoints
-- FastAPI via les fonctions d'agrégation ci-dessous (tout en SQL).
--
-- Clé multi-tenant = `ad_account_id` (identifiant Meta du compte publicitaire,
-- ex. act_2213352035718005). On NE clé PAS par meta_accounts.id car plusieurs
-- lignes meta_accounts peuvent pointer le même ad account (même Business
-- Manager) → on stocke une seule copie par ad account. Le scoping par user est
-- assuré côté API (get_meta_account(user_id, account_id) avant toute lecture).
--
-- Les ids Meta (campaign/adset/ad) sont des TEXT (ids Graph), distincts des
-- tables campaigns/ad_sets/ads existantes (audit-trail de l'agent, ids UUID).
-- ============================================================================

CREATE TABLE IF NOT EXISTS fb_campaigns (
    id              TEXT PRIMARY KEY,
    ad_account_id   TEXT NOT NULL,
    name            TEXT,
    objective       TEXT,
    status          TEXT,
    daily_budget    NUMERIC,
    lifetime_budget NUMERIC,
    start_time      TIMESTAMPTZ,
    stop_time       TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fb_campaigns_account ON fb_campaigns(ad_account_id);

CREATE TABLE IF NOT EXISTS fb_adsets (
    id                TEXT PRIMARY KEY,
    ad_account_id     TEXT NOT NULL,
    campaign_id       TEXT,
    name              TEXT,
    status            TEXT,
    daily_budget      NUMERIC,
    lifetime_budget   NUMERIC,
    optimization_goal TEXT,
    targeting         JSONB,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fb_adsets_account  ON fb_adsets(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_fb_adsets_campaign ON fb_adsets(campaign_id);

CREATE TABLE IF NOT EXISTS fb_ads (
    id            TEXT PRIMARY KEY,
    ad_account_id TEXT NOT NULL,
    adset_id      TEXT,
    campaign_id   TEXT,
    name          TEXT,
    status        TEXT,
    creative      JSONB,
    thumbnail_url TEXT,
    format        TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fb_ads_account ON fb_ads(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_fb_ads_adset   ON fb_ads(adset_id);

-- Insights quotidiens niveau ad. Colonnes pré-extraites (remplies au sync depuis
-- actions/action_values) → agrégation triviale en SQL (SUM), sans parser le JSONB
-- à la lecture. actions/action_values bruts conservés pour flexibilité future.
CREATE TABLE IF NOT EXISTS fb_insights_daily (
    id                  BIGSERIAL PRIMARY KEY,
    ad_account_id       TEXT NOT NULL,
    ad_id               TEXT NOT NULL,
    adset_id            TEXT,
    campaign_id         TEXT,
    date                DATE NOT NULL,
    spend               NUMERIC DEFAULT 0,
    impressions         BIGINT  DEFAULT 0,
    clicks              BIGINT  DEFAULT 0,
    reach               BIGINT  DEFAULT 0,
    frequency           NUMERIC DEFAULT 0,
    cpc                 NUMERIC DEFAULT 0,
    cpm                 NUMERIC DEFAULT 0,
    ctr                 NUMERIC DEFAULT 0,
    -- métriques de conversion pré-extraites
    purchases           NUMERIC DEFAULT 0,
    revenue             NUMERIC DEFAULT 0,
    leads               NUMERIC DEFAULT 0,
    post_engagement     NUMERIC DEFAULT 0,
    messaging_started   NUMERIC DEFAULT 0,
    app_installs        NUMERIC DEFAULT 0,
    link_clicks         NUMERIC DEFAULT 0,
    landing_page_views  NUMERIC DEFAULT 0,
    actions             JSONB,
    action_values       JSONB,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ad_account_id, ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_fb_insights_account_date  ON fb_insights_daily(ad_account_id, date);
CREATE INDEX IF NOT EXISTS idx_fb_insights_campaign_date ON fb_insights_daily(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_fb_insights_adset_date    ON fb_insights_daily(adset_id, date);

-- Breakdowns niveau compte (âge, genre, pays, placement, âge×genre) par jour.
-- key1 = valeur principale (tranche d'âge / pays / plateforme),
-- key2 = valeur secondaire (genre, pour le type age_gender).
CREATE TABLE IF NOT EXISTS fb_insights_breakdowns (
    id             BIGSERIAL PRIMARY KEY,
    ad_account_id  TEXT NOT NULL,
    date           DATE NOT NULL,
    breakdown_type TEXT NOT NULL,           -- age | gender | country | publisher_platform | age_gender
    key1           TEXT NOT NULL,
    key2           TEXT NOT NULL DEFAULT '',
    impressions    BIGINT  DEFAULT 0,
    clicks         BIGINT  DEFAULT 0,
    spend          NUMERIC DEFAULT 0,
    reach          BIGINT  DEFAULT 0,
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ad_account_id, date, breakdown_type, key1, key2)
);
CREATE INDEX IF NOT EXISTS idx_fb_breakdowns_account_date ON fb_insights_breakdowns(ad_account_id, date, breakdown_type);

CREATE TABLE IF NOT EXISTS fb_sync_state (
    ad_account_id        TEXT PRIMARY KEY,
    last_sync_at         TIMESTAMPTZ,
    last_sync_status     TEXT,              -- success | error | running
    last_error           TEXT,
    insights_synced_until DATE,
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- RLS activé (cohérent avec les autres tables app). Aucune policy : le backend
-- utilise la service-role key (bypass RLS) et le frontend ne lit jamais en direct.
ALTER TABLE fb_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_adsets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_ads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_insights_daily       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_insights_breakdowns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_sync_state           ENABLE ROW LEVEL SECURITY;

-- ── Fonctions d'agrégation (toute l'agrégation se fait ici, en SQL) ──────────

-- Totaux compte sur la période. ctr/cpc/cpm RECALCULÉS depuis les sommes
-- (jamais une moyenne de taux).
CREATE OR REPLACE FUNCTION fb_summary(p_account TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, leads NUMERIC, post_engagement NUMERIC,
    messaging_started NUMERIC, app_installs NUMERIC, link_clicks NUMERIC,
    landing_page_views NUMERIC, ctr NUMERIC, cpc NUMERIC, cpm NUMERIC
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
        ROUND(COALESCE(SUM(spend) / NULLIF(SUM(impressions),0) * 1000, 0), 4)
    FROM fb_insights_daily
    WHERE ad_account_id = p_account AND date BETWEEN p_start AND p_end;
$$;

-- 1 ligne par campagne (meta de fb_campaigns + sommes d'insights).
CREATE OR REPLACE FUNCTION fb_campaign_agg(p_account TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (
    id TEXT, name TEXT, objective TEXT, status TEXT, daily_budget NUMERIC,
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, leads NUMERIC, post_engagement NUMERIC,
    messaging_started NUMERIC, app_installs NUMERIC, link_clicks NUMERIC,
    landing_page_views NUMERIC, ctr NUMERIC, cpc NUMERIC, cpm NUMERIC
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
        ROUND(COALESCE(SUM(i.spend) / NULLIF(SUM(i.impressions),0) * 1000, 0), 4)
    FROM fb_campaigns c
    LEFT JOIN fb_insights_daily i
        ON i.campaign_id = c.id AND i.ad_account_id = c.ad_account_id
       AND i.date BETWEEN p_start AND p_end
    WHERE c.ad_account_id = p_account
    GROUP BY c.id, c.name, c.objective, c.status, c.daily_budget;
$$;

-- 1 ligne par ad set (optionnellement filtré par campagne).
CREATE OR REPLACE FUNCTION fb_adset_agg(p_account TEXT, p_start DATE, p_end DATE, p_campaign TEXT DEFAULT NULL)
RETURNS TABLE (
    id TEXT, name TEXT, status TEXT, optimization_goal TEXT, daily_budget NUMERIC,
    lifetime_budget NUMERIC, targeting JSONB, campaign_id TEXT,
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, ctr NUMERIC, cpc NUMERIC
) LANGUAGE sql STABLE AS $$
    SELECT
        a.id, a.name, a.status, a.optimization_goal, a.daily_budget,
        a.lifetime_budget, a.targeting, a.campaign_id,
        COALESCE(SUM(i.spend),0)::numeric,
        COALESCE(SUM(i.impressions),0)::bigint,
        COALESCE(SUM(i.clicks),0)::bigint,
        COALESCE(SUM(i.reach),0)::bigint,
        COALESCE(SUM(i.purchases),0)::numeric,
        COALESCE(SUM(i.revenue),0)::numeric,
        ROUND(COALESCE(SUM(i.clicks)::numeric / NULLIF(SUM(i.impressions),0) * 100, 0), 4),
        ROUND(COALESCE(SUM(i.spend) / NULLIF(SUM(i.clicks),0), 0), 4)
    FROM fb_adsets a
    LEFT JOIN fb_insights_daily i
        ON i.adset_id = a.id AND i.ad_account_id = a.ad_account_id
       AND i.date BETWEEN p_start AND p_end
    WHERE a.ad_account_id = p_account
      AND (p_campaign IS NULL OR a.campaign_id = p_campaign)
    GROUP BY a.id, a.name, a.status, a.optimization_goal, a.daily_budget,
             a.lifetime_budget, a.targeting, a.campaign_id;
$$;

-- 1 ligne par ad (optionnellement filtré par campagne ou ad set).
CREATE OR REPLACE FUNCTION fb_ad_agg(p_account TEXT, p_start DATE, p_end DATE, p_campaign TEXT DEFAULT NULL, p_adset TEXT DEFAULT NULL)
RETURNS TABLE (
    id TEXT, name TEXT, status TEXT, format TEXT, thumbnail_url TEXT,
    adset_id TEXT, campaign_id TEXT,
    spend NUMERIC, impressions BIGINT, clicks BIGINT, reach BIGINT,
    purchases NUMERIC, revenue NUMERIC, leads NUMERIC, ctr NUMERIC, cpc NUMERIC
) LANGUAGE sql STABLE AS $$
    SELECT
        a.id, a.name, a.status, a.format, a.thumbnail_url, a.adset_id, a.campaign_id,
        COALESCE(SUM(i.spend),0)::numeric,
        COALESCE(SUM(i.impressions),0)::bigint,
        COALESCE(SUM(i.clicks),0)::bigint,
        COALESCE(SUM(i.reach),0)::bigint,
        COALESCE(SUM(i.purchases),0)::numeric,
        COALESCE(SUM(i.revenue),0)::numeric,
        COALESCE(SUM(i.leads),0)::numeric,
        ROUND(COALESCE(SUM(i.clicks)::numeric / NULLIF(SUM(i.impressions),0) * 100, 0), 4),
        ROUND(COALESCE(SUM(i.spend) / NULLIF(SUM(i.clicks),0), 0), 4)
    FROM fb_ads a
    LEFT JOIN fb_insights_daily i
        ON i.ad_id = a.id AND i.ad_account_id = a.ad_account_id
       AND i.date BETWEEN p_start AND p_end
    WHERE a.ad_account_id = p_account
      AND (p_campaign IS NULL OR a.campaign_id = p_campaign)
      AND (p_adset IS NULL OR a.adset_id = p_adset)
    GROUP BY a.id, a.name, a.status, a.format, a.thumbnail_url, a.adset_id, a.campaign_id;
$$;

-- Série quotidienne pour les graphes.
CREATE OR REPLACE FUNCTION fb_timeseries(p_account TEXT, p_start DATE, p_end DATE)
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
    FROM fb_insights_daily i
    WHERE i.ad_account_id = p_account AND i.date BETWEEN p_start AND p_end
    GROUP BY i.date
    ORDER BY i.date;
$$;

-- Répartition par breakdown (group by key1[,key2]).
CREATE OR REPLACE FUNCTION fb_breakdown(p_account TEXT, p_start DATE, p_end DATE, p_type TEXT)
RETURNS TABLE (
    key1 TEXT, key2 TEXT, impressions BIGINT, clicks BIGINT, spend NUMERIC, reach BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT
        b.key1, b.key2,
        COALESCE(SUM(b.impressions),0)::bigint,
        COALESCE(SUM(b.clicks),0)::bigint,
        COALESCE(SUM(b.spend),0)::numeric,
        COALESCE(SUM(b.reach),0)::bigint
    FROM fb_insights_breakdowns b
    WHERE b.ad_account_id = p_account
      AND b.breakdown_type = p_type
      AND b.date BETWEEN p_start AND p_end
    GROUP BY b.key1, b.key2;
$$;
