import {
  useState, useRef, useEffect, useMemo, useCallback, createContext, useContext,
  type ReactNode, type CSSProperties,
} from "react";
import {
  LayoutDashboard, BarChart3, Facebook, Users, Sparkles, Settings as SettingsIcon,
  Bell, ChevronDown, ChevronLeft, ChevronRight, Check, Plus, Send, Paperclip, X,
  Star, Trash2, RefreshCw, Download, Image as ImageIcon, Video, Link2,
  AlertTriangle, Loader2, Mail, Lock, ExternalLink, Megaphone,
} from "lucide-react";
import {
  api, ApiError, PageInfo, PagePost, CampaignSummary,
  DashboardResponse, StructuredOutput, CampaignBriefStructured, InsightAnswerStructured,
  AudienceSummary, type CampaignDetail as CampaignDetailData, type DateRange,
} from "./lib/api";
import { useCached, clearCache } from "./lib/cache";
import { AuthUser, avatarInitials, displayName, getCachedUser, getToken, setCachedUser } from "./lib/auth";
import { fmtMoney, fmtCents, fmtNum, fmtDateTimeFull } from "./lib/format";
import { exportCampaigns, type ExportFormat } from "./lib/export";
import {
  Card, KPICard, StatusBadge, MSButton, SearchBar, FilterPill, DateRangePicker, Tabs, SlidePanel,
  EmptyState, Avatar, Placeholder, SectionTitle, LoadingOverlay, type Kpi,
} from "./components/ms/primitives";
import {
  LineChart, DonutChart, BarChart, GroupedBar,
} from "./components/ms/charts";
import { WorldMap } from "./components/ms/worldmap";

// ─── Toast system ────────────────────────────────────────────────
type Toast = { id: number; title: string; msg?: string; kind?: "info" | "success" | "error" };
const ToastCtx = createContext<(title: string, opts?: { msg?: string; kind?: Toast["kind"]; duration?: number }) => void>(() => {});
const useToast = () => useContext(ToastCtx);

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 18, right: 18, zIndex: 200, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((t) => {
        const col = t.kind === "error" ? "#EF4444" : t.kind === "success" ? "#22C55E" : "#1877F2";
        return (
          <div key={t.id} className="ms-msg" style={{ display: "flex", alignItems: "flex-start", gap: 10, width: 320, background: "#16181F", border: "1px solid " + col + "40", borderLeft: "3px solid " + col, borderRadius: 10, padding: "12px 14px", boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
            <span style={{ color: col, display: "inline-flex", marginTop: 1 }}>{t.kind === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F9FAFB" }}>{t.title}</div>
              {t.msg && <div style={{ fontSize: 12, color: "#9AA1AC", marginTop: 2 }}>{t.msg}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", display: "inline-flex" }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shell: nav config ───────────────────────────────────────────
const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaign Analysis", icon: BarChart3 },
  { id: "page", label: "Facebook Page", icon: Facebook },
  { id: "audiences", label: "Audience Insights", icon: Users },
  { id: "ai", label: "AI Agent", icon: Sparkles },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const TITLES: Record<string, string> = {
  overview: "Overview", campaigns: "Campaign Analysis", page: "Facebook Page",
  audiences: "Audience Insights", ai: "AI Agent", settings: "Settings",
};

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: collapsed ? 0 : "0 20px", justifyContent: collapsed ? "center" : "flex-start", borderBottom: "1px solid #1E2128", flexShrink: 0 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: 999, border: "2.5px solid #fff" }} />
      </div>
      {!collapsed && <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "#F9FAFB", letterSpacing: "-.01em" }}>MetaScope</span>}
    </div>
  );
}

function Sidebar({ page, navigate, collapsed, setCollapsed }: {
  page: string; navigate: (id: string) => void; collapsed: boolean; setCollapsed: (fn: (c: boolean) => boolean) => void;
}) {
  return (
    <aside style={{ width: collapsed ? 64 : 240, flexShrink: 0, background: "#0C0E13", borderRight: "1px solid #1E2128", display: "flex", flexDirection: "column", transition: "width .2s ease", zIndex: 40 }}>
      <Logo collapsed={collapsed} />
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: 12, flex: 1 }}>
        {NAV.map((n) => {
          const active = page === n.id;
          const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => navigate(n.id)} title={collapsed ? n.label : undefined} className={"ms-nav" + (active ? " active" : "")}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, height: 40, padding: collapsed ? 0 : "0 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "IBM Plex Sans", fontSize: 13.5, fontWeight: active ? 600 : 500, background: active ? "#1877F215" : "transparent", color: active ? "#fff" : "#9AA1AC", transition: "background .15s, color .15s" }}>
              {active && <span style={{ position: "absolute", left: collapsed ? 0 : -12, top: 8, bottom: 8, width: 3, borderRadius: 999, background: "#1877F2" }} />}
              <span style={{ display: "inline-flex", color: active ? "#1877F2" : "#6B7280" }}><Icon size={19} /></span>
              {!collapsed && <span>{n.label}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{ padding: 12, borderTop: "1px solid #1E2128" }}>
        <button onClick={() => setCollapsed((c) => !c)} className="ms-nav"
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", height: 38, padding: collapsed ? 0 : "0 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "#6B7280", fontFamily: "IBM Plex Sans", fontSize: 13 }}>
          <span style={{ display: "inline-flex", transform: collapsed ? "rotate(180deg)" : "none", transition: "transform .2s" }}><ChevronLeft size={18} /></span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

// Real connected ad account chip (no more hardcoded business managers). Shows
// the account name resolved from Meta + its ID; click goes to Settings.
function BMSelector({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { data } = useCached("bm-account", () =>
    Promise.allSettled([api.getSettings(), api.testSettings()]).then(([sR, tR]) => {
      const settings = sR.status === "fulfilled" ? sR.value : null;
      const test = tR.status === "fulfilled" ? tR.value : null;
      return {
        accountId: settings?.meta_ad_account_id ?? null,
        name: test && test.ok ? test.account_name ?? null : null,
        configured: !!(settings?.meta_access_token_set && settings?.meta_ad_account_id),
      };
    }), []);

  if (!data || !data.configured) {
    return (
      <button onClick={onGoToSettings} className="ms-btn" style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 8, background: "#111318", border: "1px solid #1E2128", color: "#9AA1AC", fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer" }}>
        <Link2 size={14} style={{ color: "#6B7280" }} />
        <span>{data ? "Aucun compte connecté" : "…"}</span>
      </button>
    );
  }
  const label = data.name || data.accountId || "Compte Meta";
  return (
    <button onClick={onGoToSettings} title={data.accountId || undefined} className="ms-btn" style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 12px", borderRadius: 8, background: "#111318", border: "1px solid #1E2128", color: "#D1D5DB", fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer" }}>
      <span style={{ width: 18, height: 18, borderRadius: 5, background: "#1877F2", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{label[0]?.toUpperCase()}</span>
      <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {data.accountId && <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "#6B7280" }}>{data.accountId}</span>}
    </button>
  );
}

function Topbar({ title, user, onGoToSettings }: { title: string; user: AuthUser; onGoToSettings: () => void }) {
  return (
    <header style={{ height: 56, flexShrink: 0, borderBottom: "1px solid #1E2128", background: "rgba(10,12,16,.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", zIndex: 30 }}>
      <h1 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "#F9FAFB", margin: 0, letterSpacing: "-.01em" }}>{title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="ms-icon-btn" style={{ position: "relative", width: 36, height: 36, borderRadius: 8, background: "transparent", border: "1px solid #1E2128", color: "#9AA1AC", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Bell size={18} />
          <span style={{ position: "absolute", top: 8, right: 9, width: 6, height: 6, borderRadius: 999, background: "#EF4444", border: "1.5px solid #0A0C10" }} />
        </button>
        <BMSelector onGoToSettings={onGoToSettings} />
        <Avatar name={displayName(user)} size={32} />
      </div>
    </header>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────
function ConnectPrompt({ onGoToSettings, message }: { onGoToSettings: () => void; message?: string }) {
  return (
    <EmptyState
      icon={<Link2 size={30} />}
      title="No data yet"
      subtitle={message || "Connect your Meta API key in Settings to get started."}
      cta="Go to Settings"
      onCta={onGoToSettings}
    />
  );
}

// Non-destructive error banner (amber) with an optional Retry — used when a
// fetch fails but we don't want to wipe the whole page (e.g. a transient Graph
// error while switching the date range). NEVER asks the user to "reconnect".
function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B30", color: "#FCD9A0", fontSize: 12.5 }}>
      <AlertTriangle size={15} style={{ flexShrink: 0, color: "#F59E0B" }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ms-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 7, background: "transparent", border: "1px solid #F59E0B50", color: "#FCD9A0", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "IBM Plex Sans", whiteSpace: "nowrap" }}>
          <RefreshCw size={13} /> Réessayer
        </button>
      )}
    </div>
  );
}

// Centered error state (when there's no data at all to show) with Retry.
function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "64px 20px", gap: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "#F59E0B12", border: "1px solid #F59E0B30", display: "flex", alignItems: "center", justifyContent: "center", color: "#F59E0B" }}>
        <AlertTriangle size={28} />
      </div>
      <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "#F9FAFB" }}>Impossible de charger les données</div>
      <div style={{ fontSize: 13, color: "#9AA1AC", maxWidth: 420, lineHeight: 1.5, fontFamily: "JetBrains Mono" }}>{message}</div>
      {onRetry && <div style={{ marginTop: 6 }}><MSButton variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>Réessayer</MSButton></div>}
    </div>
  );
}

const OBJ_COLORS = ["#1877F2", "#22C55E", "#F59E0B", "#A855F7", "#EC4899", "#06B6D4", "#EF4444"];

// ─── Page 1: Overview ────────────────────────────────────────────
function OverviewPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const [period, setPeriod] = useState<"7D" | "30D" | "90D" | "All">("30D");
  const [reload, setReload] = useState(0);
  const isAll = period === "All";
  const days: number | "all" = period === "7D" ? 7 : period === "30D" ? 30 : period === "90D" ? 90 : "all";
  const cacheKey = isAll ? "overview:all" : `overview:${days}`;
  const campaignRange: DateRange = isAll ? { preset: "maximum" } : { preset: `last_${days}d` };
  const { data: bundle, error, errorStatus, loading } = useCached(
    cacheKey,
    () => Promise.all([api.getDashboard(days), api.getCampaigns(campaignRange).catch(() => [] as CampaignSummary[])])
      .then(([d, c]) => ({ dashboard: d as DashboardResponse, campaigns: c as CampaignSummary[] })),
    [cacheKey, reload],
  );
  const data = bundle?.dashboard ?? null;
  const campaigns = bundle?.campaigns ?? [];
  const retry = () => setReload((n) => n + 1);
  // Force a fresh fetch (e.g. after creating a campaign in the agent).
  const refresh = () => { clearCache("overview:"); setReload((n) => n + 1); };

  if (!data) {
    // Meta not configured (400) → real "connect" prompt. Any other error → a
    // retryable error state (never tell a logged-in user to reconnect).
    if (error && errorStatus === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message={error} />;
    if (error) return <ErrorState message={error} onRetry={retry} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement du dashboard…", "Agrégation des KPIs Meta…"]} />;
  }

  const kpis: Kpi[] = (data?.kpis || []).map((k) => {
    const lbl = k.label.toLowerCase();
    const ser = data?.series || [];
    let sparkData: number[] = [];
    if (lbl.includes("spend")) sparkData = ser.map((s) => s.spend);
    else if (lbl.includes("impression")) sparkData = ser.map((s) => s.impressions);
    else if (lbl.includes("click")) sparkData = ser.map((s) => s.clicks);
    else if (lbl.includes("ctr")) sparkData = ser.map((s) => s.ctr);
    else if (lbl.includes("reach")) sparkData = ser.map((s) => s.reach);
    // Pas de fallback mock : si la série réelle n'a pas assez de points, on
    // n'affiche simplement pas de sparkline (jamais de données inventées).
    if (sparkData.length < 2) sparkData = [];
    return {
      label: k.label, value: k.value,
      change: k.change ?? undefined,
      dir: (k.change ?? 0) >= 0 ? "up" : "down",
      spark: sparkData,
    };
  });

  const series = (data?.series || []).map((s) => ({ date: new Date(s.date), spend: s.spend, impressions: s.impressions }));
  const topCampaigns = (data?.top_campaigns || []).slice(0, 5);

  // Objective breakdown from campaigns (fallback: hide if none).
  const objMap: Record<string, number> = {};
  campaigns.forEach((c) => { const o = (c.objective || "Other").toUpperCase().replace(/_/g, " "); objMap[o] = (objMap[o] || 0) + c.spend; });
  const objectives = Object.entries(objMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, value], i) => ({ label, value, color: OBJ_COLORS[i % OBJ_COLORS.length] }));
  const objTotal = objectives.reduce((s, o) => s + o.value, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header: live status + manual refresh (recompute KPIs from real data). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#9AA1AC" }}>
          {loading ? (
            <>
              <span className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: "2px solid #1E2128", borderTopColor: "#1877F2", display: "inline-block" }} />
              Mise à jour des données…
            </>
          ) : (
            <span>Données {isAll ? "sur toute la période" : `sur ${days} jours`}</span>
          )}
        </div>
        <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refresh} disabled={loading}>Rafraîchir</MSButton>
      </div>
      {/* Revalidation failed but we kept the previous data on screen. */}
      {error && <ErrorBanner message={error} onRetry={retry} />}
      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {kpis.length === 0
          ? <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6B7280", fontSize: 13, padding: 30 }}>No data for the selected period.</div>
          : kpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} />)}
      </div>

      {/* charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
        <Card pad={20}>
          <SectionTitle right={<Tabs tabs={["7D", "30D", "90D", "All"]} value={period} onChange={(t) => setPeriod(t as "7D" | "30D" | "90D" | "All")} size="sm" />}>Spend & Impressions</SectionTitle>
          <div style={{ display: "flex", gap: 18, marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "#9AA1AC" }}><span style={{ color: "#1877F2" }}>● </span>Spend</span>
            <span style={{ color: "#9AA1AC" }}><span style={{ color: "#22C55E" }}>● </span>Impressions</span>
          </div>
          <LineChart series={series} height={280} />
        </Card>
        <Card pad={20}>
          <SectionTitle>Objective Breakdown</SectionTitle>
          {objectives.length === 0 ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 13 }}>No campaign data.</div>
          ) : (
            <>
              <DonutChart data={objectives} size={180} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                {objectives.map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#D1D5DB" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: o.color }} />{o.label}</span>
                    <span style={{ fontFamily: "JetBrains Mono", color: "#6B7280" }}>{Math.round((o.value / (objTotal || 1)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <Card pad={20}>
          <SectionTitle>Top Campaigns</SectionTitle>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr 0.7fr", gap: 8, padding: "0 10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", borderBottom: "1px solid #1E2128" }}>
              {["Campaign", "Status", "Spend", "CTR", "Conv."].map((c, i) => <span key={i} style={{ textAlign: i > 1 ? "right" : "left" }}>{c}</span>)}
            </div>
            {topCampaigns.length === 0
              ? <div style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 13 }}>No active campaigns.</div>
              : topCampaigns.map((c, i) => (
                <div key={c.id || i} className="ms-trow" style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr 0.7fr", gap: 8, alignItems: "center", padding: "11px 10px", borderRadius: 8, fontSize: 13.5 }}>
                  <span style={{ color: "#F9FAFB", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span><StatusBadge status={(c.status || "ACTIVE").toUpperCase()} dot /></span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#D1D5DB" }}>{fmtMoney(c.spend)}</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#D1D5DB" }}>{c.ctr.toFixed(2)}%</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: c.conversions > 0 ? "#22C55E" : "#D1D5DB" }}>{fmtNum(c.conversions)}</span>
                </div>
              ))}
          </div>
        </Card>
        <Card pad={20}>
          <SectionTitle>Spend by Geography</SectionTitle>
          <WorldMap data={data?.geo_breakdown || []} height={300} />
        </Card>
      </div>
    </div>
  );
}

// ─── Page 2: Campaign Analysis ───────────────────────────────────
interface CampCol { k: keyof CampaignSummary | "name"; label: string; w: string; align: "left" | "right"; num?: boolean; money?: boolean; cents?: boolean; pct?: boolean; }
const CAMP_COLS: CampCol[] = [
  { k: "name", label: "Campaign Name", w: "2.4fr", align: "left" },
  { k: "status", label: "Status", w: "1fr", align: "left" },
  { k: "objective", label: "Objective", w: "1.2fr", align: "left" },
  { k: "daily_budget", label: "Budget", w: "1fr", align: "right", num: true, money: true },
  { k: "spend", label: "Spend", w: "1fr", align: "right", num: true, money: true },
  { k: "impressions", label: "Impr.", w: "1fr", align: "right", num: true },
  { k: "clicks", label: "Clicks", w: "0.9fr", align: "right", num: true },
  { k: "ctr", label: "CTR", w: "0.7fr", align: "right", num: true, pct: true },
  { k: "cpc", label: "CPC", w: "0.7fr", align: "right", num: true, cents: true },
  { k: "conversions", label: "Conv.", w: "0.8fr", align: "right", num: true },
];
const CAMP_GRID = CAMP_COLS.map((c) => c.w).join(" ");

function DetailStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B7280", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: color || "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function CampaignDetail({ campaign, range, onClose }: { campaign: CampaignSummary | null; range: DateRange; onClose: () => void }) {
  const [tab, setTab] = useState("Ad Sets");
  const [detail, setDetail] = useState<CampaignDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const rangeKey = range.since && range.until ? `${range.since}_${range.until}` : range.preset || "last_30d";

  useEffect(() => {
    if (!campaign?.id) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true); setDetail(null); setError(null); setTab("Ad Sets");
    api.getCampaignDetail(campaign.id, range)
      .then((d) => { if (!cancelled) setDetail(d); })
      // Real error (not an empty period): surface it so the user knows the
      // ad sets/ads couldn't be loaded — never silently show "0 ad sets".
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, rangeKey, reload]);

  if (!campaign) return null;
  const c = campaign;
  const mini: Array<[string, string]> = [["Spend", fmtMoney(c.spend)], ["Impressions", fmtNum(c.impressions)], ["Clicks", fmtNum(c.clicks)], ["Conv.", fmtNum(c.conversions)]];
  const empty = (label: string) => <div style={{ padding: 28, textAlign: "center", color: "#6B7280", fontSize: 13 }}>{label}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #1E2128", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "#F9FAFB", marginBottom: 6 }}>{c.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge status={(c.status || "ACTIVE").toUpperCase()} dot />
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "#6B7280" }}>{c.id}</span>
            </div>
          </div>
          <button onClick={onClose} className="ms-icon-btn" style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "1px solid #1E2128", color: "#9AA1AC", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 16 }}>
          {mini.map((m, i) => (
            <div key={i} style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", marginBottom: 4 }}>{m[0]}</div>
              <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "#F9FAFB" }}>{m[1]}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "14px 22px 0" }}><Tabs tabs={["Ad Sets", "Ads", "Demographics", "Placements"]} value={tab} onChange={setTab} size="sm" /></div>
      <div style={{ position: "relative", flex: 1, overflow: "auto", padding: 22 }}>
        {loading && (
          <LoadingOverlay delay={0} messages={["Chargement des ad sets et des ads…", "Agrégation démographie & placements…"]} />
        )}
        {error ? (
          <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
        ) : !detail ? null : (
          <>
            {tab === "Ad Sets" && (
              detail.adsets.length === 0 ? empty("Aucun ad set sur cette période.") :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.adsets.map((a, i) => (
                  <div key={i} style={{ padding: "12px 14px", background: "#111318", border: "1px solid #1E2128", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: "#F9FAFB", fontWeight: 500 }}>{a.name}</div>
                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <StatusBadge status={(a.status || "ACTIVE").toUpperCase()} dot />
                          {a.audience && a.audience !== "—" && <span style={{ fontSize: 11.5, color: "#9AA1AC" }}>{a.audience}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B7280" }}>Budget</div>
                        <div style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: "#D1D5DB" }}>{a.budget != null ? fmtCents(a.budget) : "—"}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 10 }}>
                      <DetailStat label="Impr." value={fmtNum(a.impressions)} />
                      <DetailStat label="Clicks" value={fmtNum(a.clicks)} />
                      <DetailStat label="Spend" value={fmtMoney(a.spend)} />
                      <DetailStat label="CPC" value={fmtCents(a.cpc)} />
                      <DetailStat label="CTR" value={a.ctr.toFixed(2) + "%"} />
                      <DetailStat label="ROAS" value={a.roas + "x"} color={a.roas >= 3 ? "#22C55E" : undefined} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "Ads" && (
              detail.ads.length === 0 ? empty("Aucune ad sur cette période.") :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.ads.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "#111318", border: "1px solid #1E2128", borderRadius: 8 }}>
                    {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} /> : <Placeholder w={44} height={44} label="IMG" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: "#F9FAFB", fontWeight: 500 }}>{a.name}</div>
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <StatusBadge status={(a.status || "ACTIVE").toUpperCase()} dot />
                        <span style={{ fontSize: 11, color: "#9AA1AC", background: "#1E2128", borderRadius: 5, padding: "1px 7px" }}>{a.format}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 10 }}>
                        <DetailStat label="Impr." value={fmtNum(a.impressions)} />
                        <DetailStat label="Clicks" value={fmtNum(a.clicks)} />
                        <DetailStat label="CTR" value={a.ctr.toFixed(2) + "%"} />
                        <DetailStat label="CPC" value={fmtCents(a.cpc)} />
                        <DetailStat label="Spend" value={fmtMoney(a.spend)} />
                        <DetailStat label="Conv." value={fmtNum(a.conversions)} color={a.conversions > 0 ? "#22C55E" : undefined} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "Demographics" && (
              detail.demographics.length === 0 ? empty("Pas de données démographiques.") :
              <div><div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>Impressions par âge & genre</div><GroupedBar data={detail.demographics} /></div>
            )}
            {tab === "Placements" && (
              detail.placements.length === 0 ? empty("Pas de données de placement.") :
              <div><div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Part des impressions par placement</div><BarChart data={detail.placements} height={220} /></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ExportMenu({ onExport, disabled }: { onExport: (f: ExportFormat) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const opts: Array<{ f: ExportFormat; label: string }> = [
    { f: "csv", label: "CSV (.csv)" },
    { f: "xlsx", label: "Excel (.xlsx)" },
    { f: "pdf", label: "PDF (.pdf)" },
  ];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <MSButton variant="outline" icon={<Download size={15} />} onClick={() => !disabled && setOpen((o) => !o)} disabled={disabled}>
        Export Data<ChevronDown size={14} style={{ marginLeft: 4 }} />
      </MSButton>
      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 180, background: "#16181F", border: "1px solid #1E2128", borderRadius: 10, padding: 6, zIndex: 40, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          {opts.map((o) => (
            <button key={o.f} className="ms-menu-item" onClick={() => { onExport(o.f); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12.5, color: "#D1D5DB", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignsPage({ onGoToSettings, onAskAgent }: { onGoToSettings: () => void; onAskAgent: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [objective, setObjective] = useState("All");
  const [range, setRange] = useState<DateRange>({ preset: "last_30d" });
  const [rangeLabel, setRangeLabel] = useState("30 derniers jours");
  const [sort, setSort] = useState<{ k: CampCol["k"]; dir: number }>({ k: "spend", dir: -1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CampaignSummary | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const perPage = 10;
  const rangeKey = range.since && range.until ? `${range.since}_${range.until}` : range.preset || "last_30d";

  const [reload, setReload] = useState(0);
  const { data: campaignsData, error, errorStatus, loading: campaignsLoading } = useCached(
    `campaigns:${rangeKey}`,
    () => api.getCampaigns(range),
    [rangeKey, reload],
  );
  const campaigns = campaignsData ?? [];

  const filtered = useMemo(() => {
    let rows = campaigns.filter((c) => {
      if (q && !(c.name.toLowerCase().includes(q.toLowerCase()) || (c.id || "").includes(q) || (c.objective || "").toLowerCase().includes(q.toLowerCase()))) return false;
      if (status !== "All" && (c.status || "").toUpperCase() !== status.toUpperCase()) return false;
      if (objective !== "All" && (c.objective || "").toUpperCase().replace(/_/g, " ") !== objective.toUpperCase()) return false;
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      const av = (a as any)[sort.k] ?? 0, bv = (b as any)[sort.k] ?? 0;
      if (typeof av === "string") return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    });
    return rows;
  }, [campaigns, q, status, objective, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const clickSort = (k: CampCol["k"]) => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: -1 }));

  function fmtCell(c: CampaignSummary, col: CampCol): string {
    const v = (c as any)[col.k];
    if (col.k === "name") return c.name;
    if (col.k === "objective") return (c.objective || "—").replace(/_/g, " ");
    if (v == null) return "—";
    if (col.cents) return fmtCents(v);
    if (col.money) return fmtMoney(v);
    if (col.pct) return Number(v).toFixed(2) + "%";
    if (col.num) return fmtNum(v);
    return String(v);
  }

  function handleExport(format: ExportFormat) {
    if (filtered.length === 0) { toast("Rien à exporter", { kind: "error", msg: "Aucune campagne pour ce filtre." }); return; }
    const headers = CAMP_COLS.map((c) => c.label);
    const rows = filtered.map((c) => CAMP_COLS.map((col) => fmtCell(c, col)));
    const suffix = range.since && range.until ? `${range.since}_${range.until}` : (range.preset || "all");
    const filename = `campaigns_${suffix}.${format === "xlsx" ? "xlsx" : format}`;
    try {
      exportCampaigns(format, headers, rows, filename);
      toast("Export terminé", { kind: "success", msg: `${filtered.length} campagnes → ${format.toUpperCase()}` });
    } catch (e) {
      toast("Échec de l'export", { kind: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!campaignsData) {
    if (error && errorStatus === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message={error} />;
    if (error) return <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement des campagnes…", "Récupération des insights…"]} />;
  }

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 18 }}>
      {campaignsLoading && campaignsData && (
        <LoadingOverlay messages={["Mise à jour des campagnes…", "Récupération des insights Meta…"]} />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search campaigns, IDs, objectives…" width={320} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <FilterPill label="Status" value={status} options={["All", "Active", "Paused", "Archived"]} onChange={(v) => { setStatus(v); setPage(1); }} />
          <FilterPill label="Objective" value={objective} options={["All", "Conversions", "Reach", "Traffic", "Awareness", "App Installs", "Lead Gen", "Engagement"]} onChange={(v) => { setObjective(v); setPage(1); }} />
          <DateRangePicker label={rangeLabel} activePreset={range.preset} onChange={(r, lbl) => { setRange(r); setRangeLabel(lbl); setPage(1); }} />
          <ExportMenu onExport={handleExport} disabled={filtered.length === 0} />
          <MSButton variant="primary" icon={<Plus size={15} />} onClick={onAskAgent}>New Campaign</MSButton>
        </div>
      </div>

      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: CAMP_GRID, gap: 10, padding: "12px 18px", borderBottom: "1px solid #1E2128", background: "#0E1015" }}>
          {CAMP_COLS.map((col) => (
            <button key={col.k} onClick={() => clickSort(col.k)} className="ms-th"
              style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 4, justifyContent: col.align === "right" ? "flex-end" : "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: sort.k === col.k ? "#D1D5DB" : "#6B7280", fontFamily: "IBM Plex Sans", fontWeight: 500, padding: 0 }}>
              <span>{col.label}</span>
              <span style={{ display: "inline-flex", opacity: sort.k === col.k ? 1 : 0.35, color: sort.k === col.k ? "#1877F2" : "#6B7280" }}>{sort.k === col.k && sort.dir === 1 ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
            </button>
          ))}
        </div>
        <div>
          {pageRows.length === 0
            ? <div style={{ padding: 48, textAlign: "center", color: "#6B7280", fontSize: 13.5 }}>No results for "{q}". Try a different search.</div>
            : pageRows.map((c, i) => (
              <div key={c.id || i} className="ms-trow" onMouseEnter={() => setHoverRow(c.id)} onMouseLeave={() => setHoverRow(null)} onClick={() => setSelected(c)}
                style={{ position: "relative", display: "grid", gridTemplateColumns: CAMP_GRID, gap: 10, alignItems: "center", padding: "0 18px", height: 52, borderBottom: i < pageRows.length - 1 ? "1px solid #15181E" : "none", cursor: "pointer", transition: "background .12s" }}>
                {CAMP_COLS.map((col) => {
                  if (col.k === "status") return <span key={col.k}><StatusBadge status={(c.status || "ACTIVE").toUpperCase()} dot /></span>;
                  return <span key={col.k} style={{ minWidth: 0, textAlign: col.align, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: col.num ? "JetBrains Mono" : "IBM Plex Sans", fontSize: col.num ? 12.5 : 13.5, color: col.k === "name" ? "#F9FAFB" : "#9AA1AC", fontWeight: col.k === "name" ? 500 : 400 }}>{fmtCell(c, col)}</span>;
                })}
                {hoverRow === c.id && (
                  <button onClick={(e) => { e.stopPropagation(); setSelected(c); }} className="ms-btn" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "#1877F2", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "IBM Plex Sans", boxShadow: "0 2px 12px rgba(0,0,0,.4)" }}>
                    View Details<ChevronRight size={13} />
                  </button>
                )}
              </div>
            ))}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: "#6B7280" }}>{filtered.length === 0 ? "0" : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)}`} of {filtered.length}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <MSButton variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} icon={<ChevronLeft size={14} />} disabled={page === 1}>Prev</MSButton>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} style={{ minWidth: 32, height: 30, borderRadius: 7, border: "1px solid " + (n === page ? "#1877F2" : "#1E2128"), background: n === page ? "#1877F215" : "transparent", color: n === page ? "#1877F2" : "#9AA1AC", fontSize: 13, cursor: "pointer", fontFamily: "JetBrains Mono" }}>{n}</button>
          ))}
          <MSButton variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next<ChevronRight size={14} /></MSButton>
        </div>
      </div>

      <SlidePanel open={!!selected} onClose={() => setSelected(null)}><CampaignDetail campaign={selected} range={range} onClose={() => setSelected(null)} /></SlidePanel>
    </div>
  );
}

// ─── Page 3: Facebook Page ───────────────────────────────────────
type PostSortKey = "date" | "engagement" | "reactions" | "comments" | "shares";

function PageAnalysisPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { data } = useCached(
    "facebook-page",
    () => Promise.allSettled([api.getPageInfo(), api.getPageSummary()]).then(([infoR, sumR]) => {
      const info = infoR.status === "fulfilled" ? infoR.value : null;
      const summary = sumR.status === "fulfilled" ? sumR.value : null;
      const cfg = [infoR, sumR].find((r) => r.status === "rejected" && (r as PromiseRejectedResult).reason instanceof ApiError && ((r as PromiseRejectedResult).reason as ApiError).status === 400);
      const configError = cfg ? ((cfg as PromiseRejectedResult).reason as ApiError).message : null;
      const msgs: string[] = [];
      for (const r of [infoR, sumR]) {
        if (r.status === "rejected" && !(r.reason instanceof ApiError && r.reason.status === 400)) {
          const m = r.reason instanceof ApiError ? r.reason.message : "Erreur inconnue";
          if (!msgs.includes(m)) msgs.push(m);
        }
      }
      return { info, summary, configError, apiError: msgs.length ? msgs.join(" · ") : null };
    }),
    [],
  );

  // Posts Performance table sorting (hook must run before any early return).
  const [postSort, setPostSort] = useState<{ k: PostSortKey; dir: number }>({ k: "date", dir: -1 });
  const sortedPosts = useMemo(() => {
    const list = data?.summary?.posts || [];
    const eng = (p: PagePost) => p.reactions + p.comments + p.shares;
    return [...list].sort((a, b) => {
      let av: number, bv: number;
      if (postSort.k === "date") { av = a.created_time ? new Date(a.created_time).getTime() : 0; bv = b.created_time ? new Date(b.created_time).getTime() : 0; }
      else if (postSort.k === "engagement") { av = eng(a); bv = eng(b); }
      else { av = a[postSort.k]; bv = b[postSort.k]; }
      return (av - bv) * postSort.dir;
    });
  }, [data, postSort]);
  const clickPostSort = (k: PostSortKey) => setPostSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: -1 }));

  if (!data) return <LoadingOverlay fullPage delay={0} messages={["Chargement de la page Facebook…", "Récupération des posts et de l'engagement…"]} />;
  if (data.configError) return <ConnectPrompt onGoToSettings={onGoToSettings} message={data.configError} />;
  const { info, summary, apiError } = data;
  const engagementBlocked = !!summary?.engagement_blocked;

  const followers = info?.followers_count || info?.fan_count || 0;
  const topPosts = summary?.top_posts || [];
  const kpis: Kpi[] = [
    { label: "Posts", value: fmtNum(summary?.posts_count || 0) },
    { label: "Likes", value: fmtNum(summary?.reactions || 0) },
    { label: "Comments", value: fmtNum(summary?.comments || 0) },
    { label: "Shares", value: fmtNum(summary?.shares || 0) },
  ];
  const reachKpis: Kpi[] = [
    { label: "Portée totale", value: fmtNum(summary?.reach_total || 0) },
    { label: "Portée organique", value: fmtNum(summary?.reach_organic || 0) },
    { label: "Portée payante", value: fmtNum(summary?.reach_paid || 0) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {(engagementBlocked || (apiError && /#10|pages_read_engagement/i.test(apiError))) ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B30", color: "#FCD9A0", fontSize: 12.5 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
          <span>
            L'engagement (likes, commentaires, partages) nécessite la permission <b style={{ fontFamily: "JetBrains Mono", color: "#FCD9A0" }}>pages_read_engagement</b> sur ton token Meta.
            Régénère un token avec ce scope (Graph API Explorer ou App Review), puis enregistre-le dans <button onClick={onGoToSettings} style={{ background: "none", border: "none", color: "#1877F2", cursor: "pointer", padding: 0, fontSize: 12.5, textDecoration: "underline" }}>Settings → API Keys</button>. Les posts restent affichés (engagement à 0).
          </span>
        </div>
      ) : apiError ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B30", color: "#FCD9A0", fontSize: 12.5 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
          <span>Certaines données Meta n'ont pas pu être chargées : {apiError}. Le reste de la page reste affiché.</span>
        </div>
      ) : null}
      {/* identity */}
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid #1E2128" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg, #0d2748, #122b1f 60%, #0A0C10)" }} />
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(60deg, rgba(255,255,255,.015) 0 10px, transparent 10px 20px)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 20, padding: 24 }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, overflow: "hidden", background: "linear-gradient(135deg,#1877F2,#0A57C2)", border: "3px solid #0A0C10", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans", fontWeight: 700, fontSize: 30, color: "#fff", flexShrink: 0, boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>
            {info?.picture_url ? <img src={info.picture_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (info?.name?.[0] || "P")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 24, color: "#F9FAFB", margin: 0, letterSpacing: "-.01em" }}>{info?.name || "Facebook Page"}</h2>
              {info?.category && <span style={{ fontSize: 11.5, color: "#1877F2", background: "#1877F215", border: "1px solid #1877F230", borderRadius: 999, padding: "3px 10px" }}>{info.category}</span>}
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
              <span style={{ fontSize: 13.5, color: "#D1D5DB" }}><b style={{ fontFamily: "DM Sans", color: "#F9FAFB" }}>{fmtNum(followers)}</b> followers</span>
              {info?.link && <a href={info.link} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: "#1877F2", display: "inline-flex", alignItems: "center", gap: 5 }}>View page <ExternalLink size={12} /></a>}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs : posts / likes / comments / shares (réels) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {kpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} />)}
      </div>

      {/* Portée : totale / organique / payante (28 derniers jours) */}
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", marginBottom: 8 }}>Portée (28 derniers jours)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {reachKpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} />)}
        </div>
      </div>

      {/* Top 3 posts par engagement */}
      <Card>
        <SectionTitle>Top 3 posts — meilleur engagement</SectionTitle>
        {topPosts.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "#6B7280", fontSize: 13 }}>Aucun post trouvé.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {topPosts.map((p, i) => {
              const eng = p.reactions + p.comments + p.shares;
              return (
                <div key={p.id} className="ms-fade-up" style={{ animationDelay: `${i * 70}ms`, background: "#0E1015", border: "1px solid #1E2128", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ position: "relative" }}>
                    {p.full_picture ? <img src={p.full_picture} alt="" style={{ width: "100%", height: 120, objectFit: "cover" }} /> : <Placeholder height={120} radius={0} />}
                    <span style={{ position: "absolute", top: 8, left: 8, background: "#1877F2", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono", borderRadius: 6, padding: "2px 7px" }}>#{i + 1}</span>
                  </div>
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: "#D1D5DB", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.message || "(sans texte)"}</div>
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "JetBrains Mono" }}>
                      <span style={{ color: "#9AA1AC" }}>💙 {fmtNum(p.reactions)}</span>
                      <span style={{ color: "#9AA1AC" }}>💬 {fmtNum(p.comments)}</span>
                      <span style={{ color: "#9AA1AC" }}>🔁 {fmtNum(p.shares)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7280", borderTop: "1px solid #1E2128", paddingTop: 8 }}>
                      <div>Engagement total : <b style={{ color: "#22C55E", fontFamily: "JetBrains Mono" }}>{fmtNum(eng)}</b></div>
                      <div style={{ marginTop: 3 }}>{fmtDateTimeFull(p.created_time)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* posts */}
      <Card pad={0}>
        <div style={{ padding: "18px 20px 12px" }}><SectionTitle>Posts Performance</SectionTitle></div>
        {(() => {
          const POST_GRID = "54px 2.6fr 0.9fr 0.9fr 0.9fr 0.9fr 1.4fr";
          const cols: Array<{ label: string; k?: PostSortKey; align: "left" | "right" }> = [
            { label: "", align: "left" },
            { label: "Post", align: "left" },
            { label: "Reactions", k: "reactions", align: "right" },
            { label: "Comments", k: "comments", align: "right" },
            { label: "Shares", k: "shares", align: "right" },
            { label: "Engagement", k: "engagement", align: "right" },
            { label: "Date / Heure", k: "date", align: "right" },
          ];
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: POST_GRID, gap: 10, padding: "0 20px 10px", borderBottom: "1px solid #1E2128", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280" }}>
                {cols.map((c, i) => c.k ? (
                  <button key={i} onClick={() => clickPostSort(c.k!)} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: c.align === "right" ? "flex-end" : "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: postSort.k === c.k ? "#D1D5DB" : "#6B7280", fontFamily: "IBM Plex Sans", fontWeight: 500, padding: 0 }}>
                    <span>{c.label}</span>
                    <span style={{ display: "inline-flex", opacity: postSort.k === c.k ? 1 : 0.35, color: postSort.k === c.k ? "#1877F2" : "#6B7280" }}>{postSort.k === c.k && postSort.dir === 1 ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
                  </button>
                ) : <span key={i} style={{ textAlign: c.align }}>{c.label}</span>)}
              </div>
              {sortedPosts.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 13 }}>No posts found.</div>}
              {sortedPosts.map((p, i) => {
                const eng = p.reactions + p.comments + p.shares;
                return (
                  <div key={p.id} className="ms-trow" style={{ display: "grid", gridTemplateColumns: POST_GRID, gap: 10, alignItems: "center", padding: "12px 20px", borderBottom: i < sortedPosts.length - 1 ? "1px solid #15181E" : "none" }}>
                    {p.full_picture ? <img src={p.full_picture} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} /> : <Placeholder w={40} height={40} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ color: p.permalink_url ? "#1877F2" : "#6B7280", display: "inline-flex", flexShrink: 0 }}>{p.full_picture ? <ImageIcon size={15} /> : <Link2 size={15} />}</span>
                      <span style={{ fontSize: 13.5, color: "#F9FAFB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.message || "(no text)"}</span>
                    </div>
                    {[p.reactions, p.comments, p.shares].map((v, k) => <span key={k} style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: k === 0 ? "#D1D5DB" : "#9AA1AC" }}>{fmtNum(v)}</span>)}
                    <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#22C55E" }}>{fmtNum(eng)}</span>
                    <span style={{ textAlign: "right", fontSize: 12, color: "#6B7280", fontFamily: "JetBrains Mono" }}>{fmtDateTimeFull(p.created_time)}</span>
                  </div>
                );
              })}
            </>
          );
        })()}
      </Card>

    </div>
  );
}

// ─── Page 4: Audience Insights (real custom audiences) ───────────
type AudSortKey = "name" | "type" | "size_high" | "time_created" | "time_updated" | "status";
const AUD_COLS: Array<{ k: AudSortKey; label: string; w: string; align: "left" | "right" }> = [
  { k: "name", label: "Audience", w: "2.4fr", align: "left" },
  { k: "type", label: "Type", w: "1fr", align: "left" },
  { k: "size_high", label: "Taille estimée", w: "1.2fr", align: "right" },
  { k: "time_created", label: "Créée", w: "1fr", align: "right" },
  { k: "time_updated", label: "Mise à jour", w: "1fr", align: "right" },
  { k: "status", label: "Statut", w: "1fr", align: "left" },
];
const AUD_GRID = AUD_COLS.map((c) => c.w).join(" ");
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { month: "short", day: "numeric", year: "2-digit" }) : "—");
const audSize = (a: AudienceSummary) => (a.size_high > 0 ? fmtNum(a.size_high) : a.size_low > 0 ? fmtNum(a.size_low) : "—");

function AudienceDetail({ aud, onClose }: { aud: AudienceSummary | null; onClose: () => void }) {
  if (!aud) return null;
  const meta: Array<[string, string]> = [
    ["Type", aud.type],
    ["Statut", aud.status],
    ["Rétention", aud.retention_days > 0 ? `${aud.retention_days} jours` : "—"],
    ["Créée", fmtDate(aud.time_created)],
    ["Mise à jour", fmtDate(aud.time_updated)],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #1E2128", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "#F9FAFB", marginBottom: 8 }}>{aud.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><StatusBadge status={aud.type} /><StatusBadge status={aud.status} dot /></div>
          </div>
          <button onClick={onClose} className="ms-icon-btn" style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "1px solid #1E2128", color: "#9AA1AC", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ background: "linear-gradient(135deg,#1877F215,#1877F205)", border: "1px solid #1877F230", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", marginBottom: 6 }}>Taille estimée</div>
          <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 28, color: "#F9FAFB" }}>{aud.size_low > 0 || aud.size_high > 0 ? `${fmtNum(aud.size_low)} – ${fmtNum(aud.size_high)}` : "Indisponible"}</div>
          <div style={{ fontSize: 12.5, color: "#9AA1AC", marginTop: 4 }}>personnes (estimation Meta)</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {meta.map((m, i) => (
            <div key={i} style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", marginBottom: 4 }}>{m[0]}</div>
              <div style={{ fontSize: 13.5, color: "#F9FAFB", fontWeight: 500 }}>{m[1]}</div>
            </div>
          ))}
        </div>
        {aud.description && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#F9FAFB", marginBottom: 8 }}>Description</div>
            <div style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.5 }}>{aud.description}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: 10, background: "#0E1015", border: "1px solid #1E2128", color: "#9AA1AC", fontSize: 12 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: "#6B7280" }} />
          <span>La démographie et la géographie des membres d'une audience ne sont pas exposées par l'API Meta (confidentialité).</span>
        </div>
      </div>
    </div>
  );
}

const GENDER_COLORS: Record<string, string> = { male: "#1877F2", female: "#EC4899", unknown: "#6B7280" };
const GENDER_LABELS: Record<string, string> = { male: "Hommes", female: "Femmes", unknown: "Inconnu" };

function AudiencesPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  // ── Real audience reached by delivered campaigns (period-dependent) ──
  const [reachPeriod, setReachPeriod] = useState<"7D" | "30D" | "90D" | "All">("30D");
  const [reachReload, setReachReload] = useState(0);
  const reachDays: number | "all" = reachPeriod === "7D" ? 7 : reachPeriod === "30D" ? 30 : reachPeriod === "90D" ? 90 : "all";
  const reachKey = reachDays === "all" ? "audience-reach:all" : `audience-reach:${reachDays}`;
  const { data: reach, error: reachError, errorStatus: reachStatus, loading: reachLoading } = useCached(
    reachKey, () => api.getAudienceReach(reachDays), [reachKey, reachReload],
  );
  const refreshReach = () => { clearCache("audience-reach:"); setReachReload((n) => n + 1); };

  // ── Saved custom/lookalike audiences (metadata only) ──
  const { data: audiencesData, errorStatus: audStatus } = useCached("audiences", () => api.getAudiences(), []);
  const audiences = audiencesData ?? [];
  const [q, setQ] = useState("");
  const [type, setType] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState<{ k: AudSortKey; dir: number }>({ k: "size_high", dir: -1 });
  const [selected, setSelected] = useState<AudienceSummary | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);

  const rows = useMemo(() => {
    const r = audiences.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q.toLowerCase()) && !a.type.toLowerCase().includes(q.toLowerCase())) return false;
      if (type !== "All" && a.type !== type) return false;
      if (status !== "All" && a.status !== status) return false;
      return true;
    });
    return r.slice().sort((a, b) => {
      let av: any = a[sort.k], bv: any = b[sort.k];
      if (sort.k === "time_created" || sort.k === "time_updated") { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      if (typeof av === "string") return av.localeCompare(bv) * sort.dir;
      return ((av || 0) - (bv || 0)) * sort.dir;
    });
  }, [audiences, q, type, status, sort]);
  const clickSort = (k: AudSortKey) => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: -1 }));

  // Meta not configured (400) → connect prompt; otherwise show the page and let
  // each section handle its own loading/empty/error inline.
  if (!reach && !audiencesData) {
    if (reachStatus === 400 || audStatus === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message="Connecte ton compte Meta dans Settings pour voir ton audience." />;
    if (reachError) return <ErrorState message={reachError} onRetry={() => setReachReload((n) => n + 1)} />;
    return <LoadingOverlay fullPage delay={0} messages={["Analyse de l'audience touchée…", "Agrégation des données depuis Meta…"]} />;
  }

  const genderData = (reach?.gender_breakdown || []).map((g) => ({ label: GENDER_LABELS[g.name] || g.name, value: g.value, color: GENDER_COLORS[g.name] || "#A855F7" }));
  const hasReach = !!reach && (reach.reach_total > 0 || reach.demographics.length > 0 || reach.placements.length > 0 || (reach.geo_breakdown?.length || 0) > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Audience réellement touchée par les campagnes ── */}
      <Card pad={20} style={{ position: "relative" }}>
        {reachLoading && reach && (
          <LoadingOverlay messages={["Mise à jour de l'audience…", "Agrégation des données depuis Meta…"]} />
        )}
        <SectionTitle right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tabs tabs={["7D", "30D", "90D", "All"]} value={reachPeriod} onChange={(t) => setReachPeriod(t as "7D" | "30D" | "90D" | "All")} size="sm" />
            <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refreshReach} disabled={reachLoading}>Rafraîchir</MSButton>
          </div>
        }>
          Audience touchée par tes campagnes
        </SectionTitle>
        {reachError && <div style={{ marginBottom: 14 }}><ErrorBanner message={reachError} onRetry={() => setReachReload((n) => n + 1)} /></div>}
        {reachLoading && !reach ? (
          <div style={{ position: "relative", minHeight: 220 }}>
            <LoadingOverlay delay={0} message="Chargement de l'audience touchée…" />
          </div>
        ) : !hasReach ? (
          <div style={{ padding: 28, textAlign: "center", color: "#6B7280", fontSize: 13 }}>Aucune donnée d'audience touchée sur cette période (aucune campagne diffusée).</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
              <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 28, color: "#F9FAFB" }}>{fmtNum(reach!.reach_total)}</span>
              <span style={{ fontSize: 13, color: "#9AA1AC" }}>personnes touchées {reachDays === "all" ? "sur toute la période" : `sur ${reachDays} jours`}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>Impressions par âge & genre</div>
                {reach!.demographics.length === 0 ? <div style={{ color: "#6B7280", fontSize: 12.5 }}>—</div> : <GroupedBar data={reach!.demographics} />}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>Répartition par genre</div>
                {genderData.length === 0 ? <div style={{ color: "#6B7280", fontSize: 12.5 }}>—</div> : (
                  <>
                    <DonutChart data={genderData} size={150} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
                      {genderData.map((g, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#D1D5DB" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: g.color }} />{g.label}</span>
                          <span style={{ fontFamily: "JetBrains Mono", color: "#6B7280" }}>{g.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 22 }}>
              <div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>Part des impressions par placement</div>
                {reach!.placements.length === 0 ? <div style={{ color: "#6B7280", fontSize: 12.5 }}>—</div> : <BarChart data={reach!.placements} height={200} />}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>Pays touchés</div>
                <WorldMap data={reach!.geo_breakdown || []} height={220} />
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── Audiences enregistrées (custom / lookalike) ── */}
      <SectionTitle>Audiences enregistrées (Custom / Lookalike)</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SearchBar value={q} onChange={setQ} placeholder="Rechercher une audience par nom ou type…" width={320} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FilterPill label="Type" value={type} options={["All", "Custom", "Lookalike", "Saved"]} onChange={setType} />
          <FilterPill label="Statut" value={status} options={["All", "Ready", "Updating", "Too Small"]} onChange={setStatus} />
        </div>
      </div>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: AUD_GRID, gap: 10, padding: "12px 18px", borderBottom: "1px solid #1E2128", background: "#0E1015" }}>
          {AUD_COLS.map((col) => (
            <button key={col.k} onClick={() => clickSort(col.k)} className="ms-th" style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: col.align === "right" ? "flex-end" : "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: sort.k === col.k ? "#D1D5DB" : "#6B7280", fontFamily: "IBM Plex Sans", fontWeight: 500, padding: 0 }}>
              <span>{col.label}</span>
              <span style={{ display: "inline-flex", opacity: sort.k === col.k ? 1 : 0.35, color: sort.k === col.k ? "#1877F2" : "#6B7280" }}>{sort.k === col.k && sort.dir === 1 ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
            </button>
          ))}
        </div>
        <div>
          {!audiencesData
            ? <div style={{ position: "relative", minHeight: 220 }}><LoadingOverlay delay={0} message="Chargement des audiences…" /></div>
            : rows.length === 0
            ? <div style={{ padding: 48, textAlign: "center", color: "#6B7280", fontSize: 13.5 }}>{audiences.length === 0 ? "Aucune audience sur ce compte." : `Aucun résultat pour « ${q} ».`}</div>
            : rows.map((a, i) => (
              <div key={a.id} className="ms-trow" onMouseEnter={() => setHoverRow(a.id)} onMouseLeave={() => setHoverRow(null)} onClick={() => setSelected(a)}
                style={{ position: "relative", display: "grid", gridTemplateColumns: AUD_GRID, gap: 10, alignItems: "center", padding: "0 18px", height: 52, borderBottom: i < rows.length - 1 ? "1px solid #15181E" : "none", cursor: "pointer", transition: "background .12s" }}>
                <span style={{ minWidth: 0, color: "#F9FAFB", fontWeight: 500, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <span><StatusBadge status={a.type} /></span>
                <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#D1D5DB" }}>{audSize(a)}</span>
                <span style={{ textAlign: "right", fontSize: 12.5, color: "#9AA1AC" }}>{fmtDate(a.time_created)}</span>
                <span style={{ textAlign: "right", fontSize: 12.5, color: "#9AA1AC" }}>{fmtDate(a.time_updated)}</span>
                <span><StatusBadge status={a.status} dot /></span>
                {hoverRow === a.id && (
                  <button onClick={(e) => { e.stopPropagation(); setSelected(a); }} className="ms-btn" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "#1877F2", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "IBM Plex Sans", boxShadow: "0 2px 12px rgba(0,0,0,.4)" }}>Détails<ChevronRight size={13} /></button>
                )}
              </div>
            ))}
        </div>
      </Card>
      <span style={{ fontSize: 12.5, color: "#6B7280" }}>{rows.length} audience(s)</span>
      <SlidePanel open={!!selected} onClose={() => setSelected(null)}><AudienceDetail aud={selected} onClose={() => setSelected(null)} /></SlidePanel>
    </div>
  );
}

// ─── Page 5: AI Agent (wired to backend) ─────────────────────────
type ChatMsg = { role: "user" | "ai"; text: string; time: string; structured?: StructuredOutput | null; imageHash?: string | null };
const WELCOME_MSG: ChatMsg = {
  role: "ai",
  text: "Bonjour 👋 — je suis votre agent MetaScope. Je peux créer des campagnes Meta, lire vos données de Page Facebook et publier des posts. Que souhaitez-vous faire ?",
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};
const SUGGESTED_PROMPTS = [
  "Crée une campagne trafic 'Promo été' à 10€/jour ciblant le Maroc",
  "Quel est le nom de ma Page Facebook ?",
  "Liste mes 5 dernières publications",
  "Analyse les performances de mes campagnes des 7 derniers jours",
];
type ConvSummary = { id: string; title: string | null; created_at: string };

function CampaignBriefCard({ brief }: { brief: CampaignBriefStructured }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "linear-gradient(135deg, #1877F218, #1877F205)", border: "1px solid #1877F230" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "#1877F230", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#1877F2" }}><Megaphone size={13} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>Brief de campagne — à valider</span>
      </div>
      <div>
        <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "#F9FAFB" }}>{brief.name}</div>
        <div style={{ fontSize: 11.5, color: "#9AA1AC" }}>{brief.objective} · ${brief.daily_budget_usd.toFixed(2)} / jour</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5 }}>
        <div style={{ borderRadius: 8, padding: "8px 10px", background: "#0E1015" }}>
          <div style={{ color: "#6B7280", marginBottom: 2 }}>Audience</div>
          <div style={{ color: "#D1D5DB" }}>{brief.audience.age_min}–{brief.audience.age_max} ans · {brief.audience.countries.join(", ")}</div>
          {brief.audience.interests.length > 0 && <div style={{ color: "#9AA1AC", marginTop: 4 }}>{brief.audience.interests.join(" · ")}</div>}
        </div>
        <div style={{ borderRadius: 8, padding: "8px 10px", background: "#0E1015" }}>
          <div style={{ color: "#6B7280", marginBottom: 2 }}>CTA</div>
          <div style={{ color: "#D1D5DB" }}>{brief.ad_copy.cta}</div>
          {brief.estimated_reach && <div style={{ color: "#9AA1AC", marginTop: 4 }}>~ {brief.estimated_reach}</div>}
        </div>
      </div>
      <div style={{ borderRadius: 8, padding: "8px 10px", background: "#0E1015" }}>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Headline</div>
        <div style={{ fontSize: 14, color: "#F9FAFB", fontWeight: 500 }}>{brief.ad_copy.headline}</div>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8, marginBottom: 3 }}>Texte principal</div>
        <div style={{ fontSize: 12.5, color: "#D1D5DB", lineHeight: 1.5, whiteSpace: "pre-line" }}>{brief.ad_copy.primary_text}</div>
      </div>
      {brief.image_prompt && !brief.image_hash && (
        <div style={{ borderRadius: 8, padding: "8px 10px", display: "flex", gap: 8, background: "#F59E0B12", border: "1px solid #F59E0B30" }}>
          <ImageIcon size={13} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: "#FCD9A0" }}><b>Visuel suggéré : </b>{brief.image_prompt}</span>
        </div>
      )}
      {brief.notes && <div style={{ fontSize: 11.5, color: "#9AA1AC", fontStyle: "italic" }}>{brief.notes}</div>}
    </div>
  );
}

function InsightCard({ answer }: { answer: InsightAnswerStructured }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "#0E1015", border: "1px solid #1E2128" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "#1877F220", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#1877F2" }}><Sparkles size={13} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>Analyse</span>
      </div>
      <div style={{ fontSize: 13.5, color: "#D1D5DB", lineHeight: 1.55 }}>{answer.summary}</div>
      {answer.key_metrics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {answer.key_metrics.map((m, i) => (
            <div key={i} style={{ borderRadius: 8, padding: "8px 10px", background: "#111318", border: "1px solid #1E2128" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B7280" }}>{m.label}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "#F9FAFB" }}>{m.value}</span>
                {m.trend != null && <span style={{ fontSize: 10.5, fontFamily: "JetBrains Mono", color: m.trend >= 0 ? "#22C55E" : "#EF4444" }}>{m.trend >= 0 ? "▲" : "▼"} {Math.abs(m.trend).toFixed(1)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {answer.recommendations.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B7280", marginBottom: 6, fontWeight: 600 }}>Recommandations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {answer.recommendations.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#D1D5DB" }}><ChevronRight size={13} style={{ color: "#1877F2", flexShrink: 0, marginTop: 2 }} /><span>{r}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AIAgentPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MSG]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ hash: string; previewUrl: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const autoResize = useCallback(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);
  useEffect(() => { autoResize(); }, [input, autoResize]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, typing]);

  const mapMessages = (rows: Array<{ role: string; content: string; created_at: string; metadata: Record<string, unknown> }>): ChatMsg[] =>
    rows.filter((r) => r.role === "user" || r.role === "assistant").map((r) => {
      const meta: any = r.metadata || {};
      const structured: StructuredOutput | undefined = meta.structured && (meta.structured.kind === "campaign_brief" || meta.structured.kind === "insight_answer") ? meta.structured : undefined;
      return { role: r.role === "user" ? "user" : "ai", text: r.content, time: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), structured, imageHash: meta.image_hash };
    });

  const loadConversation = async (conv: ConvSummary) => {
    try {
      const rows = await api.getMessages(conv.id);
      const mapped = mapMessages(rows);
      setMessages(mapped.length > 0 ? mapped : [{ ...WELCOME_MSG }]);
      setConversationId(conv.id);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    api.listConversations().then(async (list) => {
      setConversations(list);
      if (list.length === 0) return;
      const rows = await api.getMessages(list[0].id);
      const mapped = mapMessages(rows);
      if (mapped.length > 0) { setMessages(mapped); setConversationId(list[0].id); }
    }).catch(() => { /* ignore */ });
  }, []);

  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    setUploadError(null); setUploading(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      const res = await api.uploadChatImage(file);
      if (res.error || !res.image_hash) { setUploadError(res.error || "Upload failed."); URL.revokeObjectURL(previewUrl); return; }
      setAttachedImage({ hash: res.image_hash, previewUrl, name: file.name });
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      setUploadError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeAttachment = () => { if (attachedImage?.previewUrl) URL.revokeObjectURL(attachedImage.previewUrl); setAttachedImage(null); };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if ((!text && !attachedImage) || typing) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const imageHash = attachedImage?.hash || null;
    setMessages((prev) => [...prev, { role: "user", text: text || "(image attached)", time: now, imageHash }]);
    setInput(""); removeAttachment(); setTyping(true);
    try {
      const res = await api.chat(text || "(image attached)", conversationId || undefined, imageHash);
      if (res.conversation_id !== conversationId) {
        setConversationId(res.conversation_id);
        setConversations((prev) => prev.some((c) => c.id === res.conversation_id) ? prev : [{ id: res.conversation_id, title: text.slice(0, 40) || null, created_at: new Date().toISOString() }, ...prev]);
      }
      setMessages((prev) => [...prev, { role: "ai", text: res.reply || "(no reply)", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), structured: res.structured || null }]);
      // A campaign/post-mutating tool ran → the dashboard, campaign list and
      // audience caches are now stale. Drop them so the next visit refetches.
      const MUTATING = ["create_full_campaign", "post_to_facebook_page", "save_campaign_tree"];
      if ((res.tool_calls || []).some((t) => MUTATING.includes(t.name))) {
        clearCache("overview:"); clearCache("campaigns:"); clearCache("audience-reach:"); clearCache("facebook-page");
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "ai", text: `⚠️ ${err instanceof ApiError ? err.message : "Connection error."}`, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    } finally { setTyping(false); }
  };

  const newConversation = async () => {
    setMessages([{ ...WELCOME_MSG, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    try { const conv = await api.createConversation(); setConversationId(conv.id); setConversations((prev) => [conv, ...prev]); } catch { setConversationId(null); }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* history */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #1E2128", display: "flex", flexDirection: "column", background: "#0C0E13" }}>
        <div style={{ padding: 16 }}><MSButton variant="primary" icon={<Plus size={16} />} onClick={newConversation} style={{ width: "100%" }}>New Chat</MSButton></div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
          {conversations.length === 0 && <div style={{ textAlign: "center", color: "#4B5260", fontSize: 12, padding: "30px 0" }}>Aucune conversation</div>}
          {conversations.map((c) => (
            <button key={c.id} onClick={() => loadConversation(c)} className="ms-convo"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2, background: conversationId === c.id ? "#1877F215" : "transparent", transition: "background .12s" }}>
              <div style={{ fontSize: 13, color: conversationId === c.id ? "#F9FAFB" : "#D1D5DB", fontWeight: conversationId === c.id ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "Nouvelle conversation"}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
            </button>
          ))}
        </div>
      </div>

      {/* chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "28px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
            {messages.map((m, i) => (
              m.role === "user" ? (
                <div key={i} className="ms-msg" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
                  <div style={{ maxWidth: "72%" }}>
                    {m.imageHash && <div style={{ marginBottom: 6, fontSize: 11, color: "#7FB1F5", display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}><ImageIcon size={11} /> Image jointe ({m.imageHash.slice(0, 10)}…)</div>}
                    <div style={{ background: "#1877F2", color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "11px 15px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>{m.text}</div>
                  </div>
                </div>
              ) : (
                <div key={i} className="ms-msg" style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Sparkles size={16} /></div>
                  <div style={{ maxWidth: "78%" }}>
                    <div style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: "14px 14px 14px 4px", padding: "12px 15px", fontSize: 14, lineHeight: 1.55, color: "#D1D5DB", whiteSpace: "pre-line" }}>
                      {m.text}
                      {m.structured?.kind === "campaign_brief" && <CampaignBriefCard brief={m.structured} />}
                      {m.structured?.kind === "insight_answer" && <InsightCard answer={m.structured} />}
                    </div>
                  </div>
                </div>
              )
            ))}
            {typing && (
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Sparkles size={16} /></div>
                <div style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: "14px 14px 14px 4px", padding: "14px 16px", display: "flex", gap: 5 }}>
                  {[0, 1, 2].map((i) => <span key={i} className="ms-dot" style={{ width: 7, height: 7, borderRadius: 999, background: "#6B7280", animationDelay: i * 0.16 + "s" }} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* input bar */}
        <div style={{ borderTop: "1px solid #1E2128", padding: "16px 0 20px", flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
            {uploadError && (
              <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "#EF444412", border: "1px solid #EF444430", color: "#FCA5A5", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={13} /> {uploadError}<button onClick={() => setUploadError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}><X size={12} /></button>
              </div>
            )}
            {attachedImage && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "#1877F212", border: "1px solid #1877F230" }}>
                <img src={attachedImage.previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 12.5, color: "#F9FAFB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedImage.name}</div><div style={{ fontSize: 10.5, color: "#6B7280", fontFamily: "JetBrains Mono" }}>hash : {attachedImage.hash.slice(0, 16)}…</div></div>
                <button onClick={removeAttachment} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: 4 }}><X size={14} /></button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {SUGGESTED_PROMPTS.slice(0, 3).map((c, i) => (
                <button key={i} onClick={() => send(c)} className="ms-chip" style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #1E2128", background: "#111318", color: "#9AA1AC", fontSize: 12.5, cursor: "pointer", fontFamily: "IBM Plex Sans", transition: "all .15s" }}>"{c}"</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, background: "#1E2128", borderRadius: 14, padding: 8 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Joindre une image" style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "transparent", color: uploading ? "#1877F2" : "#9AA1AC", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onFileChosen(e.target.files?.[0] || null)} />
              <textarea ref={taRef} value={input} rows={1} placeholder="Ask about your campaigns, audiences, or spend…" onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", color: "#F9FAFB", fontSize: 14, fontFamily: "IBM Plex Sans", padding: "8px 10px", maxHeight: 120, lineHeight: 1.4 }} />
              <button onClick={() => send()} disabled={typing || (!input.trim() && !attachedImage)} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: input.trim() || attachedImage ? "#1877F2" : "#2A2E37", color: "#fff", cursor: input.trim() || attachedImage ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .15s" }}><Send size={17} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page 6: Settings ────────────────────────────────────────────
const SETTINGS_TABS = ["Profile", "API Keys", "Business Manager", "Appearance"];
const inputStyle: CSSProperties = { height: 40, background: "#111318", border: "1px solid #1E2128", borderRadius: 8, padding: "0 12px", fontSize: 14, color: "#D1D5DB", fontFamily: "IBM Plex Sans", outline: "none", width: "100%" };

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18, maxWidth: 460 }}>
      <label style={{ fontSize: 12.5, fontWeight: 500, color: "#D1D5DB" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "#6B7280" }}>{hint}</span>}
    </div>
  );
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  return <input {...props} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ ...inputStyle, borderColor: f ? "#1877F2" : "#1E2128", ...(props.style || {}) }} />;
}

function ProfileTab({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ first_name: user.first_name || "", last_name: user.last_name || "", company: user.company || "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ first_name: user.first_name || "", last_name: user.last_name || "", company: user.company || "" }); }, [user.id]);
  const save = async () => {
    setSaving(true);
    try { const u = await api.updateProfile(form); setCachedUser(u); onUserChange(u); toast("Profile saved", { kind: "success" }); }
    catch (e) { toast("Save failed", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }); }
    finally { setSaving(false); }
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Avatar name={displayName(user)} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MSButton variant="outline" size="sm">Upload photo</MSButton>
          <span style={{ fontSize: 11.5, color: "#6B7280" }}>JPG, PNG or GIF. Max 2MB.</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 460 }}>
        <Field label="First name"><TextInput value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} /></Field>
        <Field label="Last name"><TextInput value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} /></Field>
      </div>
      <Field label="Email"><TextInput value={user.email} disabled style={{ color: "#6B7280", cursor: "not-allowed" }} /></Field>
      <Field label="Company"><TextInput value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></Field>
      <div style={{ marginTop: 8 }}><MSButton variant="primary" onClick={save} disabled={saving} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>Save changes</MSButton></div>
    </div>
  );
}

function ApiKeysTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tokenSet, setTokenSet] = useState(false);
  const [adAccount, setAdAccount] = useState("");
  const [pageId, setPageId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [last4, setLast4] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // add form
  const [fToken, setFToken] = useState("");
  const [fAcct, setFAcct] = useState("");
  const [fPage, setFPage] = useState("");
  const [fPixel, setFPixel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.getSettings().then((s) => {
      setTokenSet(s.meta_access_token_set);
      setAdAccount(s.meta_ad_account_id || "");
      setPageId(s.meta_page_id || "");
      setPixelId(s.meta_pixel_id || "");
      setLast4(s.meta_ad_account_id ? s.meta_ad_account_id.slice(-4) : "••••");
    }).catch(() => { /* ignore */ }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const test = async () => {
    setTesting(true);
    try { const r = await api.testSettings(); r.ok ? toast("Token is valid", { kind: "success", msg: r.account_name }) : toast("Validation failed", { kind: "error", msg: r.error }); }
    catch (e) { toast("Validation failed", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }); }
    finally { setTesting(false); }
  };
  const del = async () => {
    // Empty strings clear the columns server-side (→ NULL). A space would be
    // stored verbatim and keep meta_access_token_set = true.
    try { await api.updateSettings({ meta_access_token: "", meta_ad_account_id: "", meta_page_id: "", meta_pixel_id: "" }); setConfirmDelete(false); setTokenSet(false); setAdAccount(""); setPageId(""); setPixelId(""); setSavedAt(null); toast("API key deleted", { kind: "success" }); }
    catch (e) { toast("Delete failed", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }); }
  };
  const add = async () => {
    if (fAcct && !/^act_\d+$/.test(fAcct)) { toast("Invalid Ad Account ID", { kind: "error", msg: "Format: act_XXXXXXXXXX" }); return; }
    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (fToken) patch.meta_access_token = fToken;
      if (fAcct) patch.meta_ad_account_id = fAcct;
      if (fPage) patch.meta_page_id = fPage;
      if (fPixel) patch.meta_pixel_id = fPixel;
      await api.updateSettings(patch);
      setAdding(false); setFToken(""); setFAcct(""); setFPage(""); setFPixel("");
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      load(); toast("Key added & verified", { kind: "success" });
    } catch (e) { toast("Save failed", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Loader2 size={20} className="animate-spin" style={{ color: "#1877F2" }} /></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h3 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "#F9FAFB", margin: 0 }}>Meta API Keys</h3>
          <p style={{ fontSize: 12.5, color: "#6B7280", margin: "4px 0 0" }}>Connect an access token to pull data into MetaScope.</p>
        </div>
        <MSButton variant="primary" icon={<Plus size={16} />} onClick={() => setAdding((a) => !a)}>{tokenSet ? "Update Key" : "Add New Key"}</MSButton>
      </div>

      {adding && (
        <div style={{ border: "1px dashed #2A2E37", borderRadius: 12, padding: 20, marginBottom: 12, background: "#0E1015" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F9FAFB", marginBottom: 16 }}>{tokenSet ? "Update API Key" : "Add New API Key"}</div>
          <Field label="Access Token" hint="Stored masked — recommend a long-lived System User token."><textarea value={fToken} onChange={(e) => setFToken(e.target.value)} placeholder="EAAB..." rows={3} style={{ ...inputStyle, height: "auto", padding: 12, fontFamily: "JetBrains Mono", fontSize: 13, resize: "vertical", lineHeight: 1.5 }} /></Field>
          <Field label="Ad Account ID"><TextInput value={fAcct} onChange={(e) => setFAcct(e.target.value)} placeholder="act_1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 460 }}>
            <Field label="Page ID (optional)"><TextInput value={fPage} onChange={(e) => setFPage(e.target.value)} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
            <Field label="Pixel ID (optional)"><TextInput value={fPixel} onChange={(e) => setFPixel(e.target.value)} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <MSButton variant="ghost" onClick={() => setAdding(false)}>Cancel</MSButton>
            <MSButton variant="primary" onClick={add} disabled={saving} icon={saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}>Add &amp; Verify</MSButton>
          </div>
        </div>
      )}

      {tokenSet ? (
        <div style={{ border: "1px solid #1877F240", background: "#1877F208", borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
              <span style={{ color: "#1877F2", display: "inline-flex", marginTop: 2 }}><Star size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 14, fontWeight: 600, color: "#F9FAFB", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{adAccount || "Compte principal"}</span>
                  <StatusBadge status="Valid" dot />
                  <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#1877F2", fontWeight: 600 }}>Default</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#9AA1AC" }}>
                  <span style={{ letterSpacing: "1px" }}>••••••••••••••••••••</span><span style={{ color: "#D1D5DB" }}>{last4}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>{pageId ? `Page ${pageId}` : "Aucune page configurée"}{pixelId ? ` · Pixel ${pixelId}` : ""}</div>
                {savedAt && <div style={{ fontSize: 11.5, color: "#22C55E", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><Check size={12} /> Mis à jour à {savedAt}</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <MSButton variant="outline" size="sm" onClick={test} icon={testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}>{testing ? "Testing…" : "Test"}</MSButton>
              <MSButton variant="outline" size="sm" danger onClick={() => setConfirmDelete(true)} icon={<Trash2 size={13} />}>Delete</MSButton>
            </div>
          </div>
        </div>
      ) : !adding && (
        <div style={{ textAlign: "center", padding: 40, color: "#6B7280", fontSize: 13.5, border: "1px dashed #1E2128", borderRadius: 12 }}>No API keys yet. Add one to start pulling data.</div>
      )}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)" }} onClick={() => setConfirmDelete(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, background: "#16181F", border: "1px solid #1E2128", borderRadius: 14, padding: 24, boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#EF444415", border: "1px solid #EF444430", color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Trash2 size={20} /></div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "#F9FAFB", marginBottom: 6 }}>Delete API key?</div>
            <div style={{ fontSize: 13.5, color: "#9AA1AC", lineHeight: 1.5, marginBottom: 20 }}>This cannot be undone and will stop data syncing from this account.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <MSButton variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</MSButton>
              <MSButton variant="primary" danger onClick={del} style={{ background: "#EF4444", borderColor: "#EF4444", color: "#fff" }}>Delete key</MSButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessManagerTab({ onGoToSettings }: { onGoToSettings: () => void }) {
  // Real connected ad account only — no hardcoded business managers/accounts.
  const { data, loading } = useCached("bm-tab-account", () =>
    Promise.allSettled([api.getSettings(), api.testSettings()]).then(([sR, tR]) => {
      const settings = sR.status === "fulfilled" ? sR.value : null;
      const test = tR.status === "fulfilled" ? tR.value : null;
      return {
        accountId: settings?.meta_ad_account_id ?? null,
        pageId: settings?.meta_page_id ?? null,
        currency: settings?.preferred_currency ?? null,
        timezone: settings?.timezone ?? null,
        configured: !!(settings?.meta_access_token_set && settings?.meta_ad_account_id),
        name: test && test.ok ? test.account_name ?? null : null,
        testError: test && !test.ok ? test.error ?? null : null,
      };
    }), []);

  if (loading && !data) return <LoadingOverlay fullPage delay={0} message="Vérification du compte connecté…" />;
  if (!data || !data.configured) {
    return (
      <EmptyState
        icon={<Link2 size={28} />}
        title="Aucun compte connecté"
        subtitle="Ajoute ton token et ton Ad Account ID dans l'onglet API Keys pour connecter ton compte Meta."
        cta="Configurer"
        onCta={onGoToSettings}
      />
    );
  }

  const rows: Array<[string, string]> = [
    ["Compte publicitaire", data.name || "(nom indisponible)"],
    ["Ad Account ID", data.accountId || "—"],
    ["Page Facebook", data.pageId || "Non configurée"],
    ["Devise", data.currency || "—"],
    ["Fuseau horaire", data.timezone || "—"],
  ];
  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: "#1877F2", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans", fontWeight: 700 }}>{(data.name || data.accountId || "M")[0]?.toUpperCase()}</span>
        <div>
          <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "#F9FAFB" }}>{data.name || "Compte Meta"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
            <StatusBadge status={data.testError ? "Error" : "Valid"} dot />
            {data.testError && <span style={{ fontSize: 11.5, color: "#F59E0B" }}>{data.testError}</span>}
          </div>
        </div>
      </div>
      <div style={{ border: "1px solid #1E2128", borderRadius: 12, overflow: "hidden" }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 16px", borderBottom: i < rows.length - 1 ? "1px solid #15181E" : "none" }}>
            <span style={{ fontSize: 12.5, color: "#9AA1AC" }}>{k}</span>
            <span style={{ fontSize: 13, color: "#E2E8F0", fontFamily: "JetBrains Mono", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <MSButton variant="outline" icon={<SettingsIcon size={14} />} onClick={onGoToSettings}>Modifier dans API Keys</MSButton>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const toast = useToast();
  const [theme, setTheme] = useState("Dark");
  const [accent, setAccent] = useState("#1877F2");
  const accents = ["#1877F2", "#22C55E", "#A855F7", "#F59E0B", "#EF4444"];
  return (
    <div>
      <Field label="Theme">
        <div style={{ display: "flex", gap: 10 }}>
          {["Dark", "Dim", "System"].map((t) => (
            <button key={t} onClick={() => setTheme(t)} style={{ flex: 1, maxWidth: 130, padding: "14px 12px", borderRadius: 10, border: "1px solid " + (theme === t ? "#1877F2" : "#1E2128"), background: theme === t ? "#1877F210" : "#111318", color: theme === t ? "#F9FAFB" : "#9AA1AC", cursor: "pointer", fontSize: 13, fontFamily: "IBM Plex Sans" }}>
              <div style={{ height: 30, borderRadius: 6, marginBottom: 8, background: t === "Dark" ? "#0A0C10" : t === "Dim" ? "#1A1D24" : "linear-gradient(90deg,#0A0C10 50%,#F9FAFB 50%)", border: "1px solid #1E2128" }} />{t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Accent color">
        <div style={{ display: "flex", gap: 10 }}>
          {accents.map((c) => (
            <button key={c} onClick={() => setAccent(c)} style={{ width: 34, height: 34, borderRadius: 999, background: c, border: accent === c ? "2px solid #F9FAFB" : "2px solid transparent", outline: accent === c ? "2px solid " + c : "none", outlineOffset: 2, cursor: "pointer" }} />
          ))}
        </div>
      </Field>
      <MSButton variant="primary" onClick={() => toast("Appearance saved", { kind: "success" })}>Save changes</MSButton>
    </div>
  );
}

function SettingsPage({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const [tab, setTab] = useState("API Keys");
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0 }}>
        {SETTINGS_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="ms-nav" style={{ textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: tab === t ? 600 : 500, fontFamily: "IBM Plex Sans", background: tab === t ? "#1877F215" : "transparent", color: tab === t ? "#fff" : "#9AA1AC" }}>{t}</button>
        ))}
      </div>
      <div style={{ flex: 1, maxWidth: 720, minWidth: 0 }}>
        {tab === "Profile" && <ProfileTab user={user} onUserChange={onUserChange} />}
        {tab === "API Keys" && <ApiKeysTab />}
        {tab === "Business Manager" && <BusinessManagerTab onGoToSettings={() => setTab("API Keys")} />}
        {tab === "Appearance" && <AppearanceTab />}
      </div>
    </div>
  );
}

// ─── Auth pages ──────────────────────────────────────────────────
function AuthShell({ heading, subtitle, children, footer }: { heading: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#0A0C10" }}>
      <div className="ms-auth-side" style={{ width: 420, flexShrink: 0, padding: 40, borderRight: "1px solid #1E2128", background: "#0C0E13", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 12, height: 12, borderRadius: 999, border: "2.5px solid #fff" }} /></div>
          <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "#F9FAFB" }}>MetaScope</span>
        </div>
        <div>
          <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 30, color: "#F9FAFB", lineHeight: 1.2, margin: 0 }}>Your Meta Ads<br />command center.</h2>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 300, marginTop: 16 }}>Create, analyze, and optimize Facebook advertising campaigns through natural language. The agent handles the API.</p>
        </div>
        <p style={{ fontSize: 11, color: "#4B5260" }}>MetaScope · Powered by LangGraph + Meta Marketing API</p>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 24, color: "#F9FAFB", margin: 0, marginBottom: 6 }}>{heading}</h1>
            <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>{subtitle}</p>
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}

function AuthInput({ icon, ...props }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 42, borderRadius: 8, background: "#111318", border: "1px solid " + (f ? "#1877F2" : "#1E2128"), transition: "border-color .15s" }}>
      <span style={{ color: "#6B7280", display: "inline-flex" }}>{icon}</span>
      <input {...props} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F9FAFB", fontSize: 14, fontFamily: "IBM Plex Sans" }} />
    </div>
  );
}

function LoginPage({ onAuth, onGoToSignup }: { onAuth: (u: AuthUser) => void; onGoToSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null);
    if (!email || !password) { setError("Please fill in both fields."); return; }
    setLoading(true);
    try { onAuth(await api.login(email, password)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Login failed."); }
    finally { setLoading(false); }
  };
  return (
    <AuthShell heading="Sign in" subtitle="Access your campaigns and analytics."
      footer={<p style={{ textAlign: "center", fontSize: 12.5, color: "#6B7280", marginTop: 24 }}>Don&apos;t have an account? <button onClick={onGoToSignup} style={{ background: "none", border: "none", color: "#1877F2", cursor: "pointer", fontWeight: 500, fontFamily: "IBM Plex Sans" }}>Sign up free</button></p>}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Email</label><AuthInput icon={<Mail size={15} />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /></div>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Password</label><AuthInput icon={<Lock size={15} />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></div>
        {error && <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12.5, color: "#FCA5A5", background: "#EF444412", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={13} />{error}</div>}
        <MSButton type="submit" variant="primary" disabled={loading} style={{ width: "100%", height: 42, marginTop: 4 }} icon={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}>{loading ? "Signing in…" : "Sign in"}</MSButton>
      </form>
    </AuthShell>
  );
}

function SignupPage({ onAuth, onGoToLogin }: { onAuth: (u: AuthUser) => void; onGoToLogin: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null);
    if (!email || !password) { setError("Email and password are required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try { onAuth(await api.signup(email, password, `${firstName} ${lastName}`.trim() || undefined)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Signup failed."); }
    finally { setLoading(false); }
  };
  return (
    <AuthShell heading="Create your account" subtitle="14-day trial · No credit card needed"
      footer={<p style={{ textAlign: "center", fontSize: 12.5, color: "#6B7280", marginTop: 20 }}>Already have an account? <button onClick={onGoToLogin} style={{ background: "none", border: "none", color: "#1877F2", cursor: "pointer", fontWeight: 500, fontFamily: "IBM Plex Sans" }}>Sign in</button></p>}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>First name</label><AuthInput icon={<></>} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" /></div>
          <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Last name</label><AuthInput icon={<></>} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" /></div>
        </div>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Work email</label><AuthInput icon={<Mail size={15} />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /></div>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Password</label><AuthInput icon={<Lock size={15} />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" /></div>
        {error && <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12.5, color: "#FCA5A5", background: "#EF444412", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={13} />{error}</div>}
        <MSButton type="submit" variant="primary" disabled={loading} style={{ width: "100%", height: 42, marginTop: 4 }} icon={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}>{loading ? "Creating account…" : "Create account"}</MSButton>
      </form>
    </AuthShell>
  );
}

// ─── Main App ────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getCachedUser());
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [page, setPage] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [transKey, setTransKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((title: string, opts: { msg?: string; kind?: Toast["kind"]; duration?: number } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, msg: opts.msg, kind: opts.kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const navigate = useCallback((id: string) => { setPage(id); setTransKey((k) => k + 1); }, []);

  useEffect(() => {
    if (!getToken()) { setBootstrapping(false); return; }
    api.me().then((u) => setUser(u)).catch(() => setUser(null)).finally(() => setBootstrapping(false));
  }, []);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 1180) setCollapsed(true); };
    onResize(); window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize);
  }, []);

  if (bootstrapping) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0C10" }}><Loader2 size={24} className="animate-spin" style={{ color: "#1877F2" }} /></div>;
  }
  if (!user) {
    return authView === "signup"
      ? <SignupPage onAuth={setUser} onGoToLogin={() => setAuthView("login")} />
      : <LoginPage onAuth={setUser} onGoToSignup={() => setAuthView("signup")} />;
  }

  const goToSettings = () => navigate("settings");
  const goToAgent = () => navigate("ai");

  const pages: Record<string, ReactNode> = {
    overview: <OverviewPage onGoToSettings={goToSettings} />,
    campaigns: <CampaignsPage onGoToSettings={goToSettings} onAskAgent={goToAgent} />,
    page: <PageAnalysisPage onGoToSettings={goToSettings} />,
    audiences: <AudiencesPage onGoToSettings={goToSettings} />,
    ai: <AIAgentPage />,
    settings: <SettingsPage user={user} onUserChange={setUser} />,
  };

  return (
    <ToastCtx.Provider value={toast}>
      <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "#0A0C10", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <Sidebar page={page} navigate={navigate} collapsed={collapsed} setCollapsed={setCollapsed} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
          <Topbar title={TITLES[page]} user={user} onGoToSettings={goToSettings} />
          <main style={{ flex: 1, overflow: page === "ai" ? "hidden" : "auto", position: "relative" }}>
            <div key={page} className="ms-page" style={{ minHeight: "100%", height: page === "ai" ? "100%" : undefined, padding: page === "ai" ? 0 : 32 }}>
              {pages[page] || pages.overview}
            </div>
          </main>
        </div>
        <ToastHost toasts={toasts} dismiss={dismiss} />
      </div>
    </ToastCtx.Provider>
  );
}
