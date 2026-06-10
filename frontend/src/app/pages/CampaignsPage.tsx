import { useMemo, useRef, useState, useEffect } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, Plus, X,
} from "lucide-react";
import type { CampaignDetailSection, CampaignSummary, DateRange } from "../lib/api";
import { fmtMoney, fmtCents, fmtNum } from "../lib/format";
import { exportCampaigns, type ExportFormat } from "../lib/export";
import {
  Card, StatusBadge, MSButton, SearchBar, FilterPill, SlidePanel, Tabs,
  Placeholder, SectionTitle, LoadingOverlay,
} from "../components/ms/primitives";
import { BarChart, GroupedBar } from "../components/ms/charts";
import { ConnectPrompt, ErrorState } from "../components/shared/states";
import { useCampaigns, useCampaignDetail, errStatus, errMessage } from "../hooks/useMetaData";
import { useFilters } from "../providers/FiltersProvider";
import { useToast } from "../providers/ToastProvider";

interface CampCol { k: keyof CampaignSummary | "name"; label: string; w: string; align: "left" | "right"; num?: boolean; money?: boolean; cents?: boolean; pct?: boolean; roasFmt?: boolean; roiFmt?: boolean; }
const CAMP_COLS: CampCol[] = [
  { k: "name", label: "Campaign Name", w: "2fr", align: "left" },
  { k: "status", label: "Status", w: "0.9fr", align: "left" },
  { k: "objective", label: "Objective", w: "1.1fr", align: "left" },
  { k: "daily_budget", label: "Budget", w: "0.9fr", align: "right", num: true, money: true },
  { k: "spend", label: "Spend", w: "0.9fr", align: "right", num: true, money: true },
  { k: "revenue", label: "Revenue", w: "0.9fr", align: "right", num: true, money: true },
  { k: "roas", label: "ROAS", w: "0.7fr", align: "right", num: true, roasFmt: true },
  { k: "roi", label: "ROI", w: "0.7fr", align: "right", num: true, roiFmt: true },
  { k: "impressions", label: "Impr.", w: "0.8fr", align: "right", num: true },
  { k: "clicks", label: "Clicks", w: "0.8fr", align: "right", num: true },
  { k: "ctr", label: "CTR", w: "0.6fr", align: "right", num: true, pct: true },
  { k: "conversions", label: "Conv.", w: "0.7fr", align: "right", num: true },
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

/** Carte « Retour sur investissement » : Dépensé · Revenu · ROAS · Profit net · ROI %.
 *  Répond directement à « j'ai dépensé X, combien ai-je gagné ? ». */
function RoiSummary({ campaigns }: { campaigns: CampaignSummary[] }) {
  const spend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const revenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
  const roas = spend ? revenue / spend : 0;
  const profit = revenue - spend;
  const roi = spend ? (profit / spend) * 100 : 0;
  const good = profit >= 0;
  const cards: Array<{ label: string; value: string; color?: string }> = [
    { label: "Dépensé", value: fmtMoney(spend) },
    { label: "Revenu", value: fmtMoney(revenue), color: "#10B981" },
    { label: "ROAS", value: `${roas.toFixed(2)}x`, color: roas >= 3 ? "#10B981" : roas >= 1 ? "#F59E0B" : "#F43F5E" },
    { label: "Profit net", value: fmtMoney(profit), color: good ? "#10B981" : "#F43F5E" },
    { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, color: good ? "#10B981" : "#F43F5E" },
  ];
  return (
    <Card pad={18}>
      <SectionTitle>Retour sur investissement</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 6 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 18, color: c.color || "#F9FAFB" }}>{c.value}</div>
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
  // On ne charge que la section de l'onglet actif ; changer d'onglet déclenche son
  // propre fetch (et TanStack garde en cache les onglets déjà ouverts).
  const detailQ = useCampaignDetail(campaign?.id ?? null, range, TAB_TO_SECTION[tab]);
  const detail = detailQ.data ?? null;
  const loading = detailQ.isFetching;
  const error = detailQ.isError ? errMessage(detailQ.error) : null;
  useEffect(() => { setTab("Ad Sets"); }, [campaign?.id]);

  if (!campaign) return null;
  const c = campaign;
  // Header centré sur le ROI : Dépensé / Revenu / ROAS / ROI.
  const roiColor = (c.roi ?? 0) >= 0 ? "#10B981" : "#F43F5E";
  const mini: Array<{ label: string; value: string; color?: string }> = [
    { label: "Dépensé", value: fmtMoney(c.spend) },
    { label: "Revenu", value: fmtMoney(c.revenue), color: "#10B981" },
    { label: "ROAS", value: `${(c.roas || 0).toFixed(2)}x`, color: (c.roas || 0) >= 3 ? "#10B981" : undefined },
    { label: "ROI", value: `${(c.roi ?? 0) >= 0 ? "+" : ""}${(c.roi ?? 0).toFixed(1)}%`, color: roiColor },
  ];
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
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: m.color || "#F9FAFB" }}>{m.value}</div>
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
                      <DetailStat label="ROAS" value={a.roas + "x"} color={a.roas >= 3 ? "#10B981" : undefined} />
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
                        <DetailStat label="Conv." value={fmtNum(a.conversions)} color={a.conversions > 0 ? "#10B981" : undefined} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "Demographics" && (
              detail.demographics.length === 0 ? empty("Pas de données démographiques.") :
              <div><div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>Impressions par âge &amp; genre</div><GroupedBar data={detail.demographics} /></div>
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
  const perPage = 10;

  const campaignsQ = useCampaigns();
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
    if (col.num) return fmtNum(v);
    return String(v);
  }

  function cellColor(c: CampaignSummary, col: CampCol): string {
    if (col.k === "name") return "#F9FAFB";
    if (col.roiFmt) return (c.roi ?? 0) >= 0 ? "#10B981" : "#F43F5E";
    if (col.roasFmt) return (c.roas ?? 0) >= 3 ? "#10B981" : "#9AA1AC";
    if (col.k === "revenue") return (c.revenue ?? 0) > 0 ? "#10B981" : "#9AA1AC";
    return "#9AA1AC";
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
                  return <span key={col.k} style={{ minWidth: 0, textAlign: col.align, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: col.num ? "JetBrains Mono" : "IBM Plex Sans", fontSize: col.num ? 12.5 : 13.5, color: cellColor(c, col), fontWeight: col.k === "name" ? 500 : 400 }}>{fmtCell(c, col)}</span>;
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
