import { RefreshCw } from "lucide-react";
import type { CampaignSummary } from "../lib/api";
import { fmtMoney, fmtNum } from "../lib/format";
import {
  Card, KPICard, StatusBadge, MSButton, SectionTitle, LoadingOverlay, type Kpi,
} from "../components/ms/primitives";
import { LineChart, DonutChart } from "../components/ms/charts";
import { WorldMap } from "../components/ms/worldmap";
import { ConnectPrompt, ErrorBanner, ErrorState, OBJ_COLORS } from "../components/shared/states";
import { useDashboard, useCampaigns, errStatus, errMessage } from "../hooks/useMetaData";
import { useFilters } from "../providers/FiltersProvider";

export function OverviewPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { rangeLabel } = useFilters();
  const dash = useDashboard();
  const camps = useCampaigns();
  const data = dash.data ?? null;
  const campaigns: CampaignSummary[] = camps.data ?? [];
  const loading = dash.isFetching;
  const error = dash.isError ? errMessage(dash.error) : null;

  if (!data) {
    if (dash.isError && errStatus(dash.error) === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message={error || undefined} />;
    if (dash.isError) return <ErrorState message={error || "Erreur"} onRetry={() => dash.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement du dashboard…", "Agrégation des KPIs Meta…"]} />;
  }

  const kpis: Kpi[] = (data.kpis || []).map((k) => {
    const lbl = k.label.toLowerCase();
    const ser = data.series || [];
    let sparkData: number[] = [];
    if (lbl.includes("spend")) sparkData = ser.map((s) => s.spend);
    else if (lbl.includes("impression")) sparkData = ser.map((s) => s.impressions);
    else if (lbl.includes("click")) sparkData = ser.map((s) => s.clicks);
    else if (lbl.includes("ctr")) sparkData = ser.map((s) => s.ctr);
    else if (lbl.includes("reach")) sparkData = ser.map((s) => s.reach);
    else if (lbl.includes("revenue")) sparkData = ser.map((s) => s.revenue);
    else if (lbl.includes("profit")) sparkData = ser.map((s) => s.profit);
    else if (lbl.includes("roas")) sparkData = ser.map((s) => s.roas);
    else if (lbl.includes("cpc")) sparkData = ser.map((s) => s.cpc);
    else if (lbl.includes("cpm")) sparkData = ser.map((s) => s.cpm);
    if (sparkData.length < 2) sparkData = [];
    // Pas de revenu (valeur "—") → série plate sans intérêt : on masque le sparkline.
    if (k.value === "—") sparkData = [];
    return {
      label: k.label, value: k.value,
      change: k.change ?? undefined,
      dir: (k.change ?? 0) >= 0 ? "up" : "down",
      spark: sparkData,
    };
  });

  const series = (data.series || []).map((s) => ({ date: new Date(s.date), spend: s.spend, impressions: s.impressions }));
  const topCampaigns = (data.top_campaigns || []).slice(0, 5);

  const objMap: Record<string, number> = {};
  campaigns.forEach((c) => { const o = (c.objective || "Other").toUpperCase().replace(/_/g, " "); objMap[o] = (objMap[o] || 0) + c.spend; });
  const objectives = Object.entries(objMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, value], i) => ({ label, value, color: OBJ_COLORS[i % OBJ_COLORS.length] }));
  const objTotal = objectives.reduce((s, o) => s + o.value, 0);

  return (
    <div className="ms-stagger" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--tx-3)" }}>
          {loading ? (
            <>
              <span className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: "2px solid var(--bd)", borderTopColor: "var(--accent)", display: "inline-block" }} />
              Mise à jour des données…
            </>
          ) : (
            <span>Données · {rangeLabel}</span>
          )}
        </div>
        <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => { dash.refetch(); camps.refetch(); }} disabled={loading}>Rafraîchir</MSButton>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => dash.refetch()} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {kpis.length === 0
          ? <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--tx-dim)", fontSize: 13, padding: 30 }}>No data for the selected period.</div>
          : kpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
        <Card pad={20}>
          <SectionTitle right={<span style={{ fontSize: 12, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>{rangeLabel}</span>}>Spend &amp; Impressions</SectionTitle>
          <div style={{ display: "flex", gap: 18, marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "var(--tx-3)" }}><span style={{ color: "var(--accent)" }}>● </span>Spend</span>
            <span style={{ color: "var(--tx-3)" }}><span style={{ color: "#22C55E" }}>● </span>Impressions</span>
          </div>
          <LineChart series={series} height={280} />
        </Card>
        <Card pad={20}>
          <SectionTitle>Objective Breakdown</SectionTitle>
          {objectives.length === 0 ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-dim)", fontSize: 13 }}>No campaign data.</div>
          ) : (
            <>
              <DonutChart data={objectives} size={180} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                {objectives.map((o, i) => (
                  <div key={i} className="ms-legend-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--tx-2)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: o.color }} />{o.label}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--tx-3)" }}>{fmtMoney(o.value)}</span>
                      <span style={{ fontFamily: "JetBrains Mono", fontWeight: 600, color: o.color, minWidth: 34, textAlign: "right" }}>{Math.round((o.value / (objTotal || 1)) * 100)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <Card pad={20}>
          <SectionTitle>Top Campaigns</SectionTitle>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr 0.7fr", gap: 8, padding: "0 10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", borderBottom: "1px solid var(--bd)" }}>
              {["Campaign", "Status", "Spend", "ROAS", "Conv."].map((c, i) => <span key={i} style={{ textAlign: i > 1 ? "right" : "left" }}>{c}</span>)}
            </div>
            {topCampaigns.length === 0
              ? <div style={{ padding: 24, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>No active campaigns.</div>
              : topCampaigns.map((c, i) => (
                <div key={c.id || i} className="ms-trow" style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr 0.7fr", gap: 8, alignItems: "center", padding: "11px 10px", borderRadius: 8, fontSize: 13.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, overflow: "hidden" }}>
                    <span style={{ flexShrink: 0, width: 18, fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600, color: "var(--tx-dim)" }}>{(i + 1).toString().padStart(2, "0")}</span>
                    <span style={{ color: "var(--tx)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  </span>
                  <span><StatusBadge status={(c.status || "ACTIVE").toUpperCase()} dot /></span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-2)" }}>{fmtMoney(c.spend)}</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: c.roas >= 3 ? "#22C55E" : "var(--tx-2)" }}>{(c.roas || 0).toFixed(2)}x</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: c.conversions > 0 ? "#22C55E" : "var(--tx-2)" }}>{fmtNum(c.conversions)}</span>
                </div>
              ))}
          </div>
        </Card>
        <Card pad={20}>
          <SectionTitle>Spend by Geography</SectionTitle>
          <WorldMap data={data.geo_breakdown || []} height={300} />
        </Card>
      </div>
    </div>
  );
}
