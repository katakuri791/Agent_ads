import { useMemo, useRef, useState, useEffect } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, Plus, SlidersHorizontal, X,
} from "lucide-react";
// ChevronRight sert d'indice « cliquer pour voir le détail » au survol des lignes.
import { api, ApiError, type CampaignDetailSection, type CampaignSummary, type DateRange } from "../lib/api";
import { fmtMoney, fmtCents, fmtNum } from "../lib/format";
import { exportCampaigns, type ExportFormat } from "../lib/export";
import {
  Card, StatusBadge, MSButton, SearchBar, FilterPill, SlidePanel, Tabs,
  Placeholder, SectionTitle, LoadingOverlay, Switch,
} from "../components/ms/primitives";
import { BarChart, GroupedBar } from "../components/ms/charts";
import { ConnectPrompt, ErrorState } from "../components/shared/states";
import { useCampaigns, useCampaignDetail, useInvalidateMetaData, errStatus, errMessage } from "../hooks/useMetaData";
import { useFilters } from "../providers/FiltersProvider";
import { useToast } from "../providers/ToastProvider";
import { useAccount } from "../providers/AccountProvider";

interface CampCol {
  k: keyof CampaignSummary | "name";
  label: string;
  wpx: number;                 // largeur en px (grille scrollable horizontalement)
  align: "left" | "right";
  group: string;               // groupe dans le sélecteur de métriques
  num?: boolean;               // police mono + fmtNum par défaut
  money?: boolean; cents?: boolean; pct?: boolean; dec2?: boolean;
  roasFmt?: boolean; roiFmt?: boolean;
}

// Catalogue COMPLET des métriques Meta Ads disponibles. L'utilisateur choisit
// lesquelles afficher (sélecteur de colonnes) ; le sous-ensemble est persisté en
// localStorage. La colonne « name » est épinglée (toujours visible, en tête).
const ALL_CAMP_COLS: CampCol[] = [
  // Général
  { k: "name", label: "Campaign Name", wpx: 240, align: "left", group: "Général" },
  { k: "status", label: "Status", wpx: 104, align: "left", group: "Général" },
  { k: "objective", label: "Objective", wpx: 150, align: "left", group: "Général" },
  { k: "daily_budget", label: "Budget", wpx: 104, align: "right", group: "Général", num: true, cents: true },
  // Dépense & coût
  { k: "spend", label: "Spend", wpx: 104, align: "right", group: "Dépense & coût", num: true, money: true },
  { k: "cpm", label: "CPM", wpx: 92, align: "right", group: "Dépense & coût", num: true, money: true },
  { k: "cpc", label: "CPC", wpx: 92, align: "right", group: "Dépense & coût", num: true, cents: true },
  { k: "cpp", label: "CPP (Reach 1k)", wpx: 120, align: "right", group: "Dépense & coût", num: true, money: true },
  { k: "cost_per_purchase", label: "Cost / Purchase", wpx: 128, align: "right", group: "Dépense & coût", num: true, money: true },
  { k: "cost_per_lead", label: "Cost / Lead", wpx: 108, align: "right", group: "Dépense & coût", num: true, money: true },
  { k: "cost_per_thruplay", label: "Cost / ThruPlay", wpx: 128, align: "right", group: "Dépense & coût", num: true, cents: true },
  // Résultats
  { k: "revenue", label: "Revenue", wpx: 104, align: "right", group: "Résultats", num: true, money: true },
  { k: "roas", label: "ROAS", wpx: 84, align: "right", group: "Résultats", num: true, roasFmt: true },
  { k: "roi", label: "ROI", wpx: 84, align: "right", group: "Résultats", num: true, roiFmt: true },
  { k: "conversions", label: "Conv.", wpx: 84, align: "right", group: "Résultats", num: true },
  { k: "purchases", label: "Purchases", wpx: 104, align: "right", group: "Résultats", num: true },
  { k: "leads", label: "Leads", wpx: 84, align: "right", group: "Résultats", num: true },
  { k: "add_to_cart", label: "Add to Cart", wpx: 108, align: "right", group: "Résultats", num: true },
  { k: "initiate_checkout", label: "Checkouts", wpx: 104, align: "right", group: "Résultats", num: true },
  { k: "landing_page_views", label: "LP Views", wpx: 100, align: "right", group: "Résultats", num: true },
  // Portée & diffusion
  { k: "impressions", label: "Impr.", wpx: 96, align: "right", group: "Portée & diffusion", num: true },
  { k: "reach", label: "Reach", wpx: 96, align: "right", group: "Portée & diffusion", num: true },
  { k: "frequency", label: "Frequency", wpx: 100, align: "right", group: "Portée & diffusion", num: true, dec2: true },
  // Clics
  { k: "clicks", label: "Clicks", wpx: 92, align: "right", group: "Clics", num: true },
  { k: "inline_link_clicks", label: "Link Clicks", wpx: 108, align: "right", group: "Clics", num: true },
  { k: "unique_clicks", label: "Unique Clicks", wpx: 120, align: "right", group: "Clics", num: true },
  { k: "outbound_clicks", label: "Outbound Clicks", wpx: 132, align: "right", group: "Clics", num: true },
  { k: "ctr", label: "CTR", wpx: 84, align: "right", group: "Clics", num: true, pct: true },
  { k: "link_ctr", label: "Link CTR", wpx: 96, align: "right", group: "Clics", num: true, pct: true },
  // Engagement
  { k: "post_engagement", label: "Post Eng.", wpx: 104, align: "right", group: "Engagement", num: true },
  { k: "post_reactions", label: "Reactions", wpx: 100, align: "right", group: "Engagement", num: true },
  { k: "post_comments", label: "Comments", wpx: 100, align: "right", group: "Engagement", num: true },
  { k: "post_shares", label: "Shares", wpx: 88, align: "right", group: "Engagement", num: true },
  { k: "post_saves", label: "Saves", wpx: 84, align: "right", group: "Engagement", num: true },
  // Vidéo
  { k: "video_plays", label: "Video Plays", wpx: 110, align: "right", group: "Vidéo", num: true },
  { k: "video_3s", label: "3-Sec Views", wpx: 110, align: "right", group: "Vidéo", num: true },
  { k: "thruplays", label: "ThruPlays", wpx: 100, align: "right", group: "Vidéo", num: true },
  { k: "video_p25", label: "Video 25%", wpx: 104, align: "right", group: "Vidéo", num: true },
  { k: "video_p50", label: "Video 50%", wpx: 104, align: "right", group: "Vidéo", num: true },
  { k: "video_p75", label: "Video 75%", wpx: 104, align: "right", group: "Vidéo", num: true },
  { k: "video_p100", label: "Video 100%", wpx: 108, align: "right", group: "Vidéo", num: true },
  { k: "hook_rate", label: "Hook Rate", wpx: 100, align: "right", group: "Vidéo", num: true, pct: true },
  { k: "hold_rate", label: "Hold Rate", wpx: 100, align: "right", group: "Vidéo", num: true, pct: true },
];

// Colonnes affichées par défaut (mêmes que la version d'origine).
const DEFAULT_COL_KEYS: Array<CampCol["k"]> = [
  "name", "status", "objective", "daily_budget", "spend", "revenue",
  "roas", "roi", "impressions", "clicks", "ctr", "conversions",
];
const COLS_STORAGE_KEY = "camp_cols_v2";
const COL_BY_KEY: Record<string, CampCol> = Object.fromEntries(ALL_CAMP_COLS.map((c) => [c.k, c]));

function loadVisibleKeys(): Array<CampCol["k"]> {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      const valid = arr.filter((k) => COL_BY_KEY[k]) as Array<CampCol["k"]>;
      if (valid.length) return valid.includes("name") ? valid : (["name", ...valid] as Array<CampCol["k"]>);
    }
  } catch { /* ignore */ }
  return DEFAULT_COL_KEYS;
}

function DetailStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--tx-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: color || "var(--tx-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

/** Carte de résultat, ADAPTATIVE selon ce que les campagnes produisent vraiment :
 *  ventes → Dépensé/Revenu/ROAS/Profit/ROI ; leads → Dépensé/Leads/Coût par lead/
 *  Taux conv. ; aucune conversion → Dépensé/Clics/CPC/CTR. Aucun chiffre inventé :
 *  on n'affiche pas un ROAS à 0 ou un ROI à −100 % quand il n'y a pas de revenu. */
function RoiSummary({ campaigns }: { campaigns: CampaignSummary[] }) {
  const spend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const revenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
  const conversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);
  const clicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const impressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
  const profile = revenue > 0 ? "sales" : conversions > 0 ? "leads" : "none";

  let title = "Retour sur investissement";
  let cards: Array<{ label: string; value: string; color?: string }>;
  if (profile === "sales") {
    const roas = spend ? revenue / spend : 0;
    const profit = revenue - spend;
    const roi = spend ? (profit / spend) * 100 : 0;
    const good = profit >= 0;
    cards = [
      { label: "Dépensé", value: fmtMoney(spend) },
      { label: "Revenu", value: fmtMoney(revenue), color: "#10B981" },
      { label: "ROAS", value: `${roas.toFixed(2)}x`, color: roas >= 3 ? "#10B981" : roas >= 1 ? "#F59E0B" : "#F43F5E" },
      { label: "Profit net", value: fmtMoney(profit), color: good ? "#10B981" : "#F43F5E" },
      { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, color: good ? "#10B981" : "#F43F5E" },
    ];
  } else if (profile === "leads") {
    title = "Performance des leads";
    const cpl = conversions ? spend / conversions : 0;
    const convRate = clicks ? (conversions / clicks) * 100 : 0;
    cards = [
      { label: "Dépensé", value: fmtMoney(spend) },
      { label: "Leads", value: fmtNum(conversions), color: "#10B981" },
      { label: "Coût / lead", value: fmtMoney(cpl), color: "#1877F2" },
      { label: "Taux conv.", value: `${convRate.toFixed(2)}%`, color: "#A855F7" },
    ];
  } else {
    title = "Performance";
    const cpc = clicks ? spend / clicks : 0;
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    cards = [
      { label: "Dépensé", value: fmtMoney(spend) },
      { label: "Clics", value: fmtNum(clicks) },
      { label: "CPC", value: fmtMoney(cpc) },
      { label: "CTR", value: `${ctr.toFixed(2)}%` },
    ];
  }
  return (
    <Card pad={18}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 12, marginTop: 6 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 18, color: c.color || "var(--tx)" }}>{c.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Chaque onglet du panneau = une section chargée à la demande (≈2 appels Meta
// au lieu de 6 par ouverture → évite « User request limit reached »).
const TAB_TO_SECTION: Record<string, CampaignDetailSection> = {
  "Ad Sets": "adsets",
  Ads: "ads",
  Demographics: "demographics",
  Placements: "placements",
};

function CampaignDetail({ campaign, range, onClose }: { campaign: CampaignSummary | null; range: DateRange; onClose: () => void }) {
  const [tab, setTab] = useState("Ad Sets");
  const toast = useToast();
  const { selectedAccountId } = useAccount();
  const invalidate = useInvalidateMetaData();
  // On ne charge que la section de l'onglet actif ; changer d'onglet déclenche son
  // propre fetch (et TanStack garde en cache les onglets déjà ouverts).
  const detailQ = useCampaignDetail(campaign?.id ?? null, range, TAB_TO_SECTION[tab]);
  const detail = detailQ.data ?? null;
  const loading = detailQ.isFetching;
  const error = detailQ.isError ? errMessage(detailQ.error) : null;
  // Activer / mettre en pause une ad (optimiste + rollback si échec).
  const [adStatusOverride, setAdStatusOverride] = useState<Record<string, string>>({});
  const [togglingAdId, setTogglingAdId] = useState<string | null>(null);
  useEffect(() => { setTab("Ad Sets"); setAdStatusOverride({}); }, [campaign?.id]);

  const toggleAdStatus = async (adId: string, cur: string) => {
    if ((cur !== "ACTIVE" && cur !== "PAUSED") || togglingAdId) return;
    const next: "ACTIVE" | "PAUSED" = cur === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setTogglingAdId(adId);
    setAdStatusOverride((m) => ({ ...m, [adId]: next }));
    try {
      await api.updateAdStatus(adId, next, selectedAccountId);
      toast(next === "ACTIVE" ? "Ad activée" : "Ad mise en pause", { kind: "success" });
      invalidate();
    } catch (e) {
      setAdStatusOverride((m) => { const n = { ...m }; delete n[adId]; return n; });
      toast("Échec de la mise à jour", { kind: "error", msg: e instanceof ApiError ? e.message : undefined });
    } finally {
      setTogglingAdId(null);
    }
  };

  if (!campaign) return null;
  const c = campaign;
  // Mini-stats adaptatives : ventes → Dépensé/Revenu/ROAS/ROI ; leads → Dépensé/
  // Leads/Coût par lead/Taux conv. ; sinon → Dépensé/Clics/CPC/CTR. Pas de ROAS
  // à 0 ni de ROI à −100 % affichés quand il n'y a pas de revenu.
  let mini: Array<{ label: string; value: string; color?: string }>;
  if ((c.revenue || 0) > 0) {
    const roiColor = (c.roi ?? 0) >= 0 ? "#10B981" : "#F43F5E";
    mini = [
      { label: "Dépensé", value: fmtMoney(c.spend) },
      { label: "Revenu", value: fmtMoney(c.revenue), color: "#10B981" },
      { label: "ROAS", value: `${(c.roas || 0).toFixed(2)}x`, color: (c.roas || 0) >= 3 ? "#10B981" : undefined },
      { label: "ROI", value: `${(c.roi ?? 0) >= 0 ? "+" : ""}${(c.roi ?? 0).toFixed(1)}%`, color: roiColor },
    ];
  } else if ((c.conversions || 0) > 0) {
    const cpl = c.conversions ? c.spend / c.conversions : 0;
    const convRate = c.clicks ? (c.conversions / c.clicks) * 100 : 0;
    mini = [
      { label: "Dépensé", value: fmtMoney(c.spend) },
      { label: "Leads", value: fmtNum(c.conversions), color: "#10B981" },
      { label: "Coût / lead", value: fmtMoney(cpl), color: "#1877F2" },
      { label: "Taux conv.", value: `${convRate.toFixed(2)}%`, color: "#A855F7" },
    ];
  } else {
    mini = [
      { label: "Dépensé", value: fmtMoney(c.spend) },
      { label: "Clics", value: fmtNum(c.clicks) },
      { label: "CPC", value: fmtMoney(c.clicks ? c.spend / c.clicks : 0) },
      { label: "CTR", value: `${(c.ctr || 0).toFixed(2)}%` },
    ];
  }
  const createdLabel = c.created_time
    ? new Date(c.created_time).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const empty = (label: string) => <div style={{ padding: 28, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>{label}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--bd)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "var(--tx)", marginBottom: 6 }}>{c.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusBadge status={(c.status || "ACTIVE").toUpperCase()} dot />
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--tx-dim)" }}>{c.id}</span>
              {createdLabel && <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>· Créée le {createdLabel}</span>}
            </div>
          </div>
          <button onClick={onClose} className="ms-icon-btn" style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 16 }}>
          {mini.map((m, i) => (
            <div key={i} style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: m.color || "var(--tx)" }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "14px 22px 0" }}><Tabs tabs={["Ad Sets", "Ads", "Demographics", "Placements"]} value={tab} onChange={setTab} size="sm" /></div>
      <div style={{ position: "relative", flex: 1, overflow: "auto", padding: 22 }}>
        {loading && <LoadingOverlay delay={0} messages={["Chargement des ad sets et des ads…", "Agrégation démographie & placements…"]} />}
        {error ? (
          <ErrorState message={error} onRetry={() => detailQ.refetch()} />
        ) : !detail ? null : (
          <>
            {tab === "Ad Sets" && (
              detail.adsets.length === 0 ? empty("Aucun ad set sur cette période.") :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.adsets.map((a, i) => (
                  <div key={i} style={{ padding: "12px 14px", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: "var(--tx)", fontWeight: 500 }}>{a.name}</div>
                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <StatusBadge status={(a.status || "ACTIVE").toUpperCase()} dot />
                          {a.audience && a.audience !== "—" && <span style={{ fontSize: 11.5, color: "var(--tx-3)" }}>{a.audience}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--tx-dim)" }}>Budget</div>
                        <div style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: "var(--tx-2)" }}>{a.budget != null ? fmtCents(a.budget) : "—"}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 10 }}>
                      <DetailStat label="Impr." value={fmtNum(a.impressions)} />
                      <DetailStat label="Clicks" value={fmtNum(a.clicks)} />
                      <DetailStat label="Spend" value={fmtMoney(a.spend)} />
                      <DetailStat label="CPC" value={fmtCents(a.cpc)} />
                      <DetailStat label="CTR" value={a.ctr.toFixed(2) + "%"} />
                      <DetailStat label="ROAS" value={a.roas + "x"} color={a.roas >= 3 ? "#10B981" : undefined} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "Ads" && (
              detail.ads.length === 0 ? empty("Aucune ad sur cette période.") :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.ads.map((a, i) => {
                  const adCur = (a.id && adStatusOverride[a.id] ? adStatusOverride[a.id] : (a.status || "ACTIVE")).toUpperCase();
                  const adToggleable = !!a.id && (adCur === "ACTIVE" || adCur === "PAUSED");
                  const adBusy = !!a.id && togglingAdId === a.id;
                  return (
                  <div key={a.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8 }}>
                    {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} /> : <Placeholder w={44} height={44} label="IMG" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 13.5, color: "var(--tx)", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                        {/* Switch activer/pause de l'ad — désactivé si Meta ne fournit pas d'id. */}
                        {adToggleable
                          ? <Switch checked={adCur === "ACTIVE"} disabled={adBusy} onChange={() => toggleAdStatus(a.id!, adCur)} title={adCur === "ACTIVE" ? "Mettre l'ad en pause" : "Activer l'ad"} />
                          : null}
                      </div>
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <StatusBadge status={adCur} dot />
                        <span style={{ fontSize: 11, color: "var(--tx-3)", background: "var(--bd)", borderRadius: 5, padding: "1px 7px" }}>{a.format}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 10 }}>
                        <DetailStat label="Impr." value={fmtNum(a.impressions)} />
                        <DetailStat label="Clicks" value={fmtNum(a.clicks)} />
                        <DetailStat label="CTR" value={a.ctr.toFixed(2) + "%"} />
                        <DetailStat label="CPC" value={fmtCents(a.cpc)} />
                        <DetailStat label="Spend" value={fmtMoney(a.spend)} />
                        <DetailStat label="Conv." value={fmtNum(a.conversions)} color={a.conversions > 0 ? "#10B981" : undefined} />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            {tab === "Demographics" && (
              detail.demographics.length === 0 ? empty("Pas de données démographiques.") :
              <div><div style={{ fontSize: 12, color: "var(--tx-dim)", marginBottom: 16 }}>Impressions par âge &amp; genre</div><GroupedBar data={detail.demographics} /></div>
            )}
            {tab === "Placements" && (
              detail.placements.length === 0 ? empty("Pas de données de placement.") :
              <div><div style={{ fontSize: 12, color: "var(--tx-dim)", marginBottom: 8 }}>Part des impressions par placement</div><BarChart data={detail.placements} height={220} /></div>
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
        <div style={{ position: "absolute", top: 42, right: 0, width: 180, background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 10, padding: 6, zIndex: 40, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          {opts.map((o) => (
            <button key={o.f} className="ms-menu-item" onClick={() => { onExport(o.f); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12.5, color: "var(--tx-2)", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sélecteur de métriques : l'utilisateur coche les colonnes à afficher, groupées
 *  par famille (Dépense, Résultats, Clics, Vidéo…). « name » est épinglée. */
function ColumnsMenu({ visibleKeys, onChange }: { visibleKeys: Array<CampCol["k"]>; onChange: (keys: Array<CampCol["k"]>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const visible = new Set(visibleKeys);
  const toggle = (k: CampCol["k"]) => {
    if (k === "name") return; // épinglée
    // Conserve l'ordre du catalogue en reconstruisant depuis ALL_CAMP_COLS.
    const next = new Set(visible);
    next.has(k) ? next.delete(k) : next.add(k);
    onChange(ALL_CAMP_COLS.filter((c) => c.k === "name" || next.has(c.k)).map((c) => c.k));
  };
  const groups = ALL_CAMP_COLS.reduce<Record<string, CampCol[]>>((acc, c) => {
    (acc[c.group] = acc[c.group] || []).push(c);
    return acc;
  }, {});
  const count = visibleKeys.filter((k) => k !== "name").length;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <MSButton variant="outline" icon={<SlidersHorizontal size={15} />} onClick={() => setOpen((o) => !o)}>
        Métriques<span style={{ marginLeft: 6, fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--accent)" }}>{count}</span>
        <ChevronDown size={14} style={{ marginLeft: 4 }} />
      </MSButton>
      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 320, maxHeight: 440, overflow: "auto", background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 12, padding: 12, zIndex: 40, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--tx)" }}>Colonnes affichées</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onChange(ALL_CAMP_COLS.map((c) => c.k))} className="ms-menu-item" style={{ fontSize: 11, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer" }}>Tout</button>
              <button onClick={() => onChange(DEFAULT_COL_KEYS)} className="ms-menu-item" style={{ fontSize: 11, color: "var(--tx-dim)", background: "transparent", border: "none", cursor: "pointer" }}>Défaut</button>
            </div>
          </div>
          {Object.entries(groups).map(([group, cols]) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 5 }}>{group}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {cols.map((c) => {
                  const on = c.k === "name" || visible.has(c.k);
                  return (
                    <label key={c.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: c.k === "name" ? "default" : "pointer", fontSize: 12.5, color: c.k === "name" ? "var(--tx-dim)" : "var(--tx-2)", opacity: c.k === "name" ? 0.7 : 1 }}
                      className={c.k === "name" ? undefined : "ms-menu-item"}>
                      <input type="checkbox" checked={on} disabled={c.k === "name"} onChange={() => toggle(c.k)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
                      <span>{c.label}{c.k === "name" ? " (épinglée)" : ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignsPage({ onGoToSettings, onAskAgent }: { onGoToSettings: () => void; onAskAgent: () => void }) {
  const toast = useToast();
  const { range } = useFilters();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [objective, setObjective] = useState("All");
  const [sort, setSort] = useState<{ k: CampCol["k"]; dir: number }>({ k: "spend", dir: -1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CampaignSummary | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Array<CampCol["k"]>>(loadVisibleKeys);
  const perPage = 10;

  // Persiste le choix de colonnes de l'utilisateur (survit au rechargement).
  useEffect(() => {
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(visibleKeys)); } catch { /* ignore */ }
  }, [visibleKeys]);

  // Colonnes visibles dans l'ordre du catalogue (« name » toujours en tête).
  const cols = useMemo(() => {
    const vis = new Set(visibleKeys);
    return ALL_CAMP_COLS.filter((c) => c.k === "name" || vis.has(c.k));
  }, [visibleKeys]);
  // Colonne « Actif » (switch) placée EN TÊTE (à gauche), puis les colonnes métriques.
  const CAMP_GRID = "92px " + cols.map((c) => `${c.wpx}px`).join(" ");
  // Largeur mini du tableau → scroll horizontal quand beaucoup de colonnes.
  const gridMinWidth = cols.reduce((s, c) => s + c.wpx, 0) + 92 + cols.length * 10 + 36;

  const { selectedAccountId } = useAccount();
  const invalidate = useInvalidateMetaData();
  // Plus de toggle FB/IG sur cette page → on ignore le filtre plateforme (comme avant).
  const campaignsQ = useCampaigns({ ignorePlatform: true });
  const campaigns = campaignsQ.data ?? [];
  const campaignsLoading = campaignsQ.isFetching;

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

  // Activer / mettre en pause une campagne (mise à jour optimiste + rollback si échec).
  const toggleStatus = async (c: CampaignSummary, cur: string) => {
    if (cur !== "ACTIVE" && cur !== "PAUSED" || togglingId) return;
    const next: "ACTIVE" | "PAUSED" = cur === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setTogglingId(c.id);
    setStatusOverride((m) => ({ ...m, [c.id]: next }));
    try {
      await api.updateCampaignStatus(c.id, next, selectedAccountId);
      toast(next === "ACTIVE" ? "Campagne activée" : "Campagne mise en pause", { kind: "success" });
      invalidate();
    } catch (e) {
      setStatusOverride((m) => { const n = { ...m }; delete n[c.id]; return n; });
      toast("Échec de la mise à jour", { kind: "error", msg: e instanceof ApiError ? e.message : undefined });
    } finally {
      setTogglingId(null);
    }
  };

  function fmtCell(c: CampaignSummary, col: CampCol): string {
    const v = (c as any)[col.k];
    if (col.k === "name") return c.name;
    if (col.k === "objective") return (c.objective || "—").replace(/_/g, " ");
    if (col.roasFmt) return `${Number(v || 0).toFixed(2)}x`;
    if (col.roiFmt) return `${Number(v || 0) >= 0 ? "+" : ""}${Number(v || 0).toFixed(1)}%`;
    if (v == null) return "—";
    if (col.cents) return fmtCents(v);
    if (col.money) return fmtMoney(v);
    if (col.pct) return Number(v).toFixed(2) + "%";
    if (col.dec2) return Number(v || 0).toFixed(2);
    if (col.num) return fmtNum(v);
    return String(v);
  }

  function cellColor(c: CampaignSummary, col: CampCol): string {
    if (col.k === "name") return "var(--tx)";
    if (col.roiFmt) return (c.roi ?? 0) >= 0 ? "#10B981" : "#F43F5E";
    if (col.roasFmt) return (c.roas ?? 0) >= 3 ? "#10B981" : "var(--tx-3)";
    if (col.k === "revenue") return (c.revenue ?? 0) > 0 ? "#10B981" : "var(--tx-3)";
    return "var(--tx-3)";
  }

  function handleExport(format: ExportFormat) {
    if (filtered.length === 0) { toast("Rien à exporter", { kind: "error", msg: "Aucune campagne pour ce filtre." }); return; }
    const headers = cols.map((c) => c.label);
    const rows = filtered.map((c) => cols.map((col) => fmtCell(c, col)));
    const suffix = range.since && range.until ? `${range.since}_${range.until}` : (range.preset || "all");
    const filename = `campaigns_${suffix}.${format === "xlsx" ? "xlsx" : format}`;
    try {
      exportCampaigns(format, headers, rows, filename);
      toast("Export terminé", { kind: "success", msg: `${filtered.length} campagnes → ${format.toUpperCase()}` });
    } catch (e) {
      toast("Échec de l'export", { kind: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!campaignsQ.data) {
    if (campaignsQ.isError && errStatus(campaignsQ.error) === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message={errMessage(campaignsQ.error) || undefined} />;
    if (campaignsQ.isError) return <ErrorState message={errMessage(campaignsQ.error) || "Erreur"} onRetry={() => campaignsQ.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement des campagnes…", "Récupération des insights…"]} />;
  }

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 18 }}>
      {campaignsLoading && <LoadingOverlay messages={["Mise à jour des campagnes…", "Récupération des insights Meta…"]} />}

      <RoiSummary campaigns={filtered} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search campaigns, IDs, objectives…" width={320} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <FilterPill label="Status" value={status} options={["All", "Active", "Paused", "Archived"]} onChange={(v) => { setStatus(v); setPage(1); }} />
          <FilterPill label="Objective" value={objective} options={["All", "Conversions", "Reach", "Traffic", "Awareness", "App Installs", "Lead Gen", "Engagement"]} onChange={(v) => { setObjective(v); setPage(1); }} />
          <ColumnsMenu visibleKeys={visibleKeys} onChange={setVisibleKeys} />
          <ExportMenu onExport={handleExport} disabled={filtered.length === 0} />
          <MSButton variant="primary" icon={<Plus size={15} />} onClick={onAskAgent}>New Campaign</MSButton>
        </div>
      </div>

      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: gridMinWidth }}>
        <div style={{ display: "grid", gridTemplateColumns: CAMP_GRID, gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--bd)", background: "var(--surf-2)" }}>
          <span style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", fontFamily: "IBM Plex Sans", fontWeight: 500 }}>Actif</span>
          {cols.map((col) => (
            <button key={col.k} onClick={() => clickSort(col.k)} className="ms-th"
              style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 4, justifyContent: col.align === "right" ? "flex-end" : "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: sort.k === col.k ? "var(--tx-2)" : "var(--tx-dim)", fontFamily: "IBM Plex Sans", fontWeight: 500, padding: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.label}</span>
              <span style={{ display: "inline-flex", flexShrink: 0, opacity: sort.k === col.k ? 1 : 0.35, color: sort.k === col.k ? "var(--accent)" : "var(--tx-dim)" }}>{sort.k === col.k && sort.dir === 1 ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
            </button>
          ))}
        </div>
        <div>
          {pageRows.length === 0
            ? <div style={{ padding: 48, textAlign: "center", color: "var(--tx-dim)", fontSize: 13.5 }}>No results for "{q}". Try a different search.</div>
            : pageRows.map((c, i) => {
              const cur = (statusOverride[c.id] ?? c.status ?? "ACTIVE").toUpperCase();
              const toggleable = cur === "ACTIVE" || cur === "PAUSED";
              const busy = togglingId === c.id;
              return (
                <div key={c.id || i} className="ms-trow" onClick={() => setSelected(c)}
                  onMouseEnter={() => setHoverRow(c.id)} onMouseLeave={() => setHoverRow(null)}
                  style={{ position: "relative", display: "grid", gridTemplateColumns: CAMP_GRID, gap: 10, alignItems: "center", padding: "0 18px", height: 52, borderBottom: i < pageRows.length - 1 ? "1px solid var(--bd-weak)" : "none", cursor: "pointer", transition: "background .12s" }}>
                  {/* Colonne « Actif » (à gauche) : switch ON/OFF + indice « voir détails » au survol.
                      stopPropagation sur le switch pour ne pas ouvrir le panneau détail au clic. */}
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    {toggleable
                      ? <Switch checked={cur === "ACTIVE"} disabled={busy} onChange={() => toggleStatus(c, cur)} title={cur === "ACTIVE" ? "Mettre en pause" : "Activer"} />
                      : <span style={{ width: 38 }} />}
                    <span style={{ display: "inline-flex", color: "var(--accent)", opacity: hoverRow === c.id ? 1 : 0, transition: "opacity .15s" }} title="Voir les détails"><ChevronRight size={16} /></span>
                  </span>
                  {cols.map((col) => {
                    if (col.k === "status") return <span key={col.k}><StatusBadge status={cur} dot /></span>;
                    return <span key={col.k} style={{ minWidth: 0, textAlign: col.align, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: col.num ? "JetBrains Mono" : "IBM Plex Sans", fontSize: col.num ? 12.5 : 13.5, color: cellColor(c, col), fontWeight: col.k === "name" ? 500 : 400 }}>{fmtCell(c, col)}</span>;
                  })}
                </div>
              );
            })}
        </div>
        </div>
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: "var(--tx-dim)" }}>{filtered.length === 0 ? "0" : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)}`} of {filtered.length}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <MSButton variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} icon={<ChevronLeft size={14} />} disabled={page === 1}>Prev</MSButton>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} style={{ minWidth: 32, height: 30, borderRadius: 7, border: "1px solid " + (n === page ? "var(--accent)" : "var(--bd)"), background: n === page ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", color: n === page ? "var(--accent)" : "var(--tx-3)", fontSize: 13, cursor: "pointer", fontFamily: "JetBrains Mono" }}>{n}</button>
          ))}
          <MSButton variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next<ChevronRight size={14} /></MSButton>
        </div>
      </div>

      <SlidePanel open={!!selected} onClose={() => setSelected(null)}><CampaignDetail campaign={selected} range={range} onClose={() => setSelected(null)} /></SlidePanel>
    </div>
  );
}
