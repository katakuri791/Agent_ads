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
    if (sparkData.length < 2) sparkData = [];
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#9AA1AC" }}>
          {loading ? (
            <>
              <span className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: "2px solid #1E2128", borderTopColor: "#1877F2", display: "inline-block" }} />
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
          ? <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6B7280", fontSize: 13, padding: 30 }}>No data for the selected period.</div>
          : kpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
        <Card pad={20}>
          <SectionTitle right={<span style={{ fontSize: 12, color: "#6B7280", fontFamily: "JetBrains Mono" }}>{rangeLabel}</span>}>Spend &amp; Impressions</SectionTitle>
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

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <Card pad={20}>
          <SectionTitle>Top Campaigns</SectionTitle>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr 0.7fr", gap: 8, padding: "0 10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B7280", borderBottom: "1px solid #1E2128" }}>
              {["Campaign", "Status", "Spend", "ROAS", "Conv."].map((c, i) => <span key={i} style={{ textAlign: i > 1 ? "right" : "left" }}>{c}</span>)}
            </div>
            {topCampaigns.length === 0
              ? <div style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 13 }}>No active campaigns.</div>
              : topCampaigns.map((c, i) => (
                <div key={c.id || i} className="ms-trow" style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.7fr 0.7fr", gap: 8, alignItems: "center", padding: "11px 10px", borderRadius: 8, fontSize: 13.5 }}>
                  <span style={{ color: "#F9FAFB", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span><StatusBadge status={(c.status || "ACTIVE").toUpperCase()} dot /></span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#D1D5DB" }}>{fmtMoney(c.spend)}</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: c.roas >= 3 ? "#22C55E" : "#D1D5DB" }}>{(c.roas || 0).toFixed(2)}x</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: c.conversions > 0 ? "#22C55E" : "#D1D5DB" }}>{fmtNum(c.conversions)}</span>
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
