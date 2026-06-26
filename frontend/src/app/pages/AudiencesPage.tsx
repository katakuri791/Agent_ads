import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import type { AudienceSummary } from "../lib/api";
import { fmtNum } from "../lib/format";
import {
  Card, StatusBadge, MSButton, SearchBar, FilterPill, SlidePanel,
  SectionTitle, LoadingOverlay, Tabs,
} from "../components/ms/primitives";
import { DonutChart, BarChart, GroupedBar } from "../components/ms/charts";
import { WorldMap } from "../components/ms/worldmap";
import { ConnectPrompt, ErrorBanner, ErrorState } from "../components/shared/states";
import { useAudienceReach, useAudiences, errStatus, errMessage } from "../hooks/useMetaData";

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
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--bd)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "var(--tx)", marginBottom: 8 }}>{aud.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><StatusBadge status={aud.type} /><StatusBadge status={aud.status} dot /></div>
          </div>
          <button onClick={onClose} className="ms-icon-btn" style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ background: "linear-gradient(135deg,color-mix(in srgb, var(--accent) 8%, transparent),color-mix(in srgb, var(--accent) 2%, transparent))", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 6 }}>Taille estimée</div>
          <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 28, color: "var(--tx)" }}>{aud.size_low > 0 || aud.size_high > 0 ? `${fmtNum(aud.size_low)} – ${fmtNum(aud.size_high)}` : "Indisponible"}</div>
          <div style={{ fontSize: 12.5, color: "var(--tx-3)", marginTop: 4 }}>personnes (estimation Meta)</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {meta.map((m, i) => (
            <div key={i} style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 4 }}>{m[0]}</div>
              <div style={{ fontSize: 13.5, color: "var(--tx)", fontWeight: 500 }}>{m[1]}</div>
            </div>
          ))}
        </div>
        {aud.description && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginBottom: 8 }}>Description</div>
            <div style={{ fontSize: 13, color: "var(--tx-2)", lineHeight: 1.5 }}>{aud.description}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: 10, background: "var(--surf-2)", border: "1px solid var(--bd)", color: "var(--tx-3)", fontSize: 12 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--tx-dim)" }} />
          <span>La démographie et la géographie des membres d'une audience ne sont pas exposées par l'API Meta (confidentialité).</span>
        </div>
      </div>
    </div>
  );
}

const GENDER_COLORS: Record<string, string> = { male: "var(--accent)", female: "#EC4899", unknown: "var(--tx-dim)" };
const GENDER_LABELS: Record<string, string> = { male: "Hommes", female: "Femmes", unknown: "Inconnu" };

export function AudiencesPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const [reachPeriod, setReachPeriod] = useState<"7D" | "30D" | "90D" | "All">("30D");
  const reachDays: number | "all" = reachPeriod === "7D" ? 7 : reachPeriod === "30D" ? 30 : reachPeriod === "90D" ? 90 : "all";
  const reachQ = useAudienceReach(reachDays);
  const reach = reachQ.data ?? null;
  const reachLoading = reachQ.isFetching;
  const reachError = reachQ.isError ? errMessage(reachQ.error) : null;

  const audQ = useAudiences();
  const audiences = audQ.data ?? [];
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

  if (!reach && !audQ.data) {
    if (errStatus(reachQ.error) === 400 || errStatus(audQ.error) === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message="Connecte ton compte Meta dans Settings pour voir ton audience." />;
    if (reachError) return <ErrorState message={reachError} onRetry={() => reachQ.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Analyse de l'audience touchée…", "Agrégation des données depuis Meta…"]} />;
  }

  const genderData = (reach?.gender_breakdown || []).map((g) => ({ label: GENDER_LABELS[g.name] || g.name, value: g.value, color: GENDER_COLORS[g.name] || "#A855F7" }));
  const hasReach = !!reach && (reach.reach_total > 0 || reach.demographics.length > 0 || reach.placements.length > 0 || (reach.geo_breakdown?.length || 0) > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card pad={20} style={{ position: "relative" }}>
        {reachLoading && reach && <LoadingOverlay messages={["Mise à jour de l'audience…", "Agrégation des données depuis Meta…"]} />}
        <SectionTitle right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tabs tabs={["7D", "30D", "90D", "All"]} value={reachPeriod} onChange={(t) => setReachPeriod(t as "7D" | "30D" | "90D" | "All")} size="sm" />
            <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => reachQ.refetch()} disabled={reachLoading}>Rafraîchir</MSButton>
          </div>
        }>
          Audience touchée par tes campagnes
        </SectionTitle>
        {reachError && <div style={{ marginBottom: 14 }}><ErrorBanner message={reachError} onRetry={() => reachQ.refetch()} /></div>}
        {reachLoading && !reach ? (
          <div style={{ position: "relative", minHeight: 220 }}>
            <LoadingOverlay delay={0} message="Chargement de l'audience touchée…" />
          </div>
        ) : !hasReach ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucune donnée d'audience touchée sur cette période (aucune campagne diffusée).</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
              <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 28, color: "var(--tx)" }}>{fmtNum(reach!.reach_total)}</span>
              <span style={{ fontSize: 13, color: "var(--tx-3)" }}>personnes touchées {reachDays === "all" ? "sur toute la période" : `sur ${reachDays} jours`}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--tx-dim)", marginBottom: 14 }}>Impressions par âge &amp; genre</div>
                {reach!.demographics.length === 0 ? <div style={{ color: "var(--tx-dim)", fontSize: 12.5 }}>—</div> : <GroupedBar data={reach!.demographics} />}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--tx-dim)", marginBottom: 14 }}>Répartition par genre</div>
                {genderData.length === 0 ? <div style={{ color: "var(--tx-dim)", fontSize: 12.5 }}>—</div> : (
                  <>
                    <DonutChart data={genderData} size={150} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
                      {genderData.map((g, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--tx-2)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: g.color }} />{g.label}</span>
                          <span style={{ fontFamily: "JetBrains Mono", color: "var(--tx-dim)" }}>{g.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 22 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--tx-dim)", marginBottom: 10 }}>Part des impressions par placement</div>
                {reach!.placements.length === 0 ? <div style={{ color: "var(--tx-dim)", fontSize: 12.5 }}>—</div> : <BarChart data={reach!.placements} height={200} />}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--tx-dim)", marginBottom: 10 }}>Pays touchés</div>
                <WorldMap data={reach!.geo_breakdown || []} height={220} />
              </div>
            </div>
          </>
        )}
      </Card>

      <SectionTitle>Audiences enregistrées (Custom / Lookalike)</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SearchBar value={q} onChange={setQ} placeholder="Rechercher une audience par nom ou type…" width={320} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FilterPill label="Type" value={type} options={["All", "Custom", "Lookalike", "Saved"]} onChange={setType} />
          <FilterPill label="Statut" value={status} options={["All", "Ready", "Updating", "Too Small"]} onChange={setStatus} />
        </div>
      </div>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: AUD_GRID, gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--bd)", background: "var(--surf-2)" }}>
          {AUD_COLS.map((col) => (
            <button key={col.k} onClick={() => clickSort(col.k)} className="ms-th" style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: col.align === "right" ? "flex-end" : "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: sort.k === col.k ? "var(--tx-2)" : "var(--tx-dim)", fontFamily: "IBM Plex Sans", fontWeight: 500, padding: 0 }}>
              <span>{col.label}</span>
              <span style={{ display: "inline-flex", opacity: sort.k === col.k ? 1 : 0.35, color: sort.k === col.k ? "var(--accent)" : "var(--tx-dim)" }}>{sort.k === col.k && sort.dir === 1 ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
            </button>
          ))}
        </div>
        <div>
          {!audQ.data
            ? <div style={{ position: "relative", minHeight: 220 }}><LoadingOverlay delay={0} message="Chargement des audiences…" /></div>
            : rows.length === 0
            ? <div style={{ padding: 48, textAlign: "center", color: "var(--tx-dim)", fontSize: 13.5 }}>{audiences.length === 0 ? "Aucune audience sur ce compte." : `Aucun résultat pour « ${q} ».`}</div>
            : rows.map((a, i) => (
              <div key={a.id} className="ms-trow" onMouseEnter={() => setHoverRow(a.id)} onMouseLeave={() => setHoverRow(null)} onClick={() => setSelected(a)}
                style={{ position: "relative", display: "grid", gridTemplateColumns: AUD_GRID, gap: 10, alignItems: "center", padding: "0 18px", height: 52, borderBottom: i < rows.length - 1 ? "1px solid var(--bd-weak)" : "none", cursor: "pointer", transition: "background .12s" }}>
                <span style={{ minWidth: 0, color: "var(--tx)", fontWeight: 500, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <span><StatusBadge status={a.type} /></span>
                <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-2)" }}>{audSize(a)}</span>
                <span style={{ textAlign: "right", fontSize: 12.5, color: "var(--tx-3)" }}>{fmtDate(a.time_created)}</span>
                <span style={{ textAlign: "right", fontSize: 12.5, color: "var(--tx-3)" }}>{fmtDate(a.time_updated)}</span>
                <span><StatusBadge status={a.status} dot /></span>
                {hoverRow === a.id && (
                  <button onClick={(e) => { e.stopPropagation(); setSelected(a); }} className="ms-btn" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "IBM Plex Sans", boxShadow: "0 2px 12px rgba(0,0,0,.4)" }}>Détails<ChevronRight size={13} /></button>
                )}
              </div>
            ))}
        </div>
      </Card>
      <span style={{ fontSize: 12.5, color: "var(--tx-dim)" }}>{rows.length} audience(s)</span>
      <SlidePanel open={!!selected} onClose={() => setSelected(null)}><AudienceDetail aud={selected} onClose={() => setSelected(null)} /></SlidePanel>
    </div>
  );
}
