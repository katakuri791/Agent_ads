import { AlertTriangle, RefreshCw } from "lucide-react";
import type { CampaignSummary } from "../lib/api";
import { describeActivity, fmtMoney, fmtNum } from "../lib/format";
import {
  Card, KPICard, MSButton, SectionTitle, LoadingOverlay, type Kpi,
} from "../components/ms/primitives";
import { LineChart, DonutChart } from "../components/ms/charts";
import { WorldMap } from "../components/ms/worldmap";
import { ConnectPrompt, ErrorBanner, ErrorState, OBJ_COLORS } from "../components/shared/states";
import { useDashboard, useCampaigns, errStatus, errMessage } from "../hooks/useMetaData";
import { useFilters } from "../providers/FiltersProvider";

/** Classe les campagnes « meilleures » sur une combinaison de : dépense engagée
 *  ET qualité du retour (CTR, conversions/CTA, CPC, clics). Chaque métrique est
 *  normalisée min-max sur l'ensemble des campagnes ayant réellement dépensé, puis
 *  pondérée. Le CPC est inversé (plus bas = mieux). Données réelles uniquement :
 *  on ne classe que les campagnes avec spend > 0. */
function rankBestCampaigns(campaigns: CampaignSummary[], limit = 5): CampaignSummary[] {
  const cand = campaigns.filter((c) => (c.spend || 0) > 0);
  if (cand.length === 0) return [];
  const range = (vals: number[]) => { const mn = Math.min(...vals), mx = Math.max(...vals); return { mn, span: mx - mn }; };
  const norm = (v: number, r: { mn: number; span: number }) => (r.span <= 0 ? 1 : (v - r.mn) / r.span);
  const rSpend = range(cand.map((c) => c.spend || 0));
  const rCtr = range(cand.map((c) => c.ctr || 0));
  const rClicks = range(cand.map((c) => c.clicks || 0));
  const rCpc = range(cand.map((c) => c.cpc || 0));
  const rConv = range(cand.map((c) => c.conversions || 0));
  const score = (c: CampaignSummary) =>
    0.30 * norm(c.spend || 0, rSpend) +
    0.25 * norm(c.ctr || 0, rCtr) +
    0.20 * norm(c.clicks || 0, rClicks) +
    0.15 * (1 - norm(c.cpc || 0, rCpc)) + // CPC : plus bas = meilleur
    0.10 * norm(c.conversions || 0, rConv);
  return cand.slice().sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function OverviewPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { rangeLabel } = useFilters();
  // L'Overview reste « tout le compte » : on ignore volontairement le filtre
  // Facebook/Instagram (le toggle vit uniquement sur la page Campaigns).
  const dash = useDashboard({ ignorePlatform: true });
  const camps = useCampaigns({ ignorePlatform: true });
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
    else if (lbl.startsWith("lead")) sparkData = ser.map((s) => s.leads);
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
  // Classement « meilleures campagnes » calculé sur la vraie liste (spend + CTR +
  // clics + CPC + conversions). Repli sur le top backend si la liste n'est pas encore
  // chargée.
  const topCampaigns = campaigns.length > 0 ? rankBestCampaigns(campaigns, 5) : (data.top_campaigns || []).slice(0, 5);

  const objMap: Record<string, number> = {};
  campaigns.forEach((c) => { const o = (c.objective || "Other").toUpperCase().replace(/_/g, " "); objMap[o] = (objMap[o] || 0) + c.spend; });
  const objectives = Object.entries(objMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, value], i) => ({ label, value, color: OBJ_COLORS[i % OBJ_COLORS.length] }));
  const objTotal = objectives.reduce((s, o) => s + o.value, 0);
  const activity = describeActivity(data.last_activity_date);

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => { dash.refetch(); camps.refetch(); }} disabled={loading}>Rafraîchir</MSButton>
        </div>
      </div>
      {activity && (
        <div
          role={activity.stale ? "status" : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
            color: activity.stale ? "#F59E0B" : "var(--tx-3)",
            ...(activity.stale ? {
              padding: "9px 13px", borderRadius: 10,
              background: "color-mix(in srgb, #F59E0B 9%, transparent)",
              border: "1px solid color-mix(in srgb, #F59E0B 28%, transparent)",
            } : {}),
          }}
        >
          {activity.stale && <AlertTriangle size={14} style={{ flexShrink: 0 }} />}
          <span>
            {activity.stale
              ? <>Aucune dépense depuis le <strong>{activity.label}</strong>. Les chiffres sont à jour : vos publicités ne diffusent plus. Vérifiez la diffusion et la facturation dans le Gestionnaire de publicités Meta.</>
              : <>Dernière activité Meta : {activity.label}</>}
          </span>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={() => dash.refetch()} />}
      <div className="ov-kpis">
        {kpis.length === 0
          ? <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--tx-dim)", fontSize: 13, padding: 30 }}>Aucune donnée sur la période sélectionnée.</div>
          : kpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} decorate={false} />)}
      </div>

      <div className="ov-row ov-row-a">
        <Card pad={20}>
          <SectionTitle right={<span style={{ fontSize: 12, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>{rangeLabel}</span>}>Dépenses &amp; Impressions</SectionTitle>
          <div style={{ display: "flex", gap: 18, marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "var(--tx-3)" }}><span style={{ color: "var(--accent)" }}>● </span>Dépenses</span>
            <span style={{ color: "var(--tx-3)" }}><span style={{ color: "#22C55E" }}>● </span>Impressions</span>
          </div>
          <LineChart series={series} height={280} />
        </Card>
        <Card pad={20}>
          <SectionTitle>Répartition par objectif</SectionTitle>
          {objectives.length === 0 ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucune donnée de campagne.</div>
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

      <div className="ov-row ov-row-b">
        <Card pad={20}>
          <SectionTitle right={<span style={{ fontSize: 11, color: "var(--tx-dim)" }}>Dépense × CTR × CPC × clics</span>}>Meilleures campagnes</SectionTitle>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.7fr 0.7fr 0.8fr", gap: 8, padding: "0 10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", borderBottom: "1px solid var(--bd)" }}>
              {["Campagne", "Dépense", "CTR", "CPC", "Clics"].map((c, i) => <span key={i} style={{ textAlign: i > 0 ? "right" : "left" }}>{c}</span>)}
            </div>
            {topCampaigns.length === 0
              ? <div style={{ padding: 24, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucune campagne avec dépense sur la période.</div>
              : topCampaigns.map((c, i) => (
                <div key={c.id || i} className="ms-trow" style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 0.7fr 0.7fr 0.8fr", gap: 8, alignItems: "center", padding: "11px 10px", borderRadius: 8, fontSize: 13.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, overflow: "hidden" }}>
                    <span style={{ flexShrink: 0, width: 18, fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600, color: i === 0 ? "var(--accent)" : "var(--tx-dim)" }}>{(i + 1).toString().padStart(2, "0")}</span>
                    <span style={{ color: "var(--tx)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  </span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-2)" }}>{fmtMoney(c.spend)}</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: (c.ctr || 0) >= 2 ? "#22C55E" : "var(--tx-2)" }}>{(c.ctr || 0).toFixed(2)}%</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-2)" }}>{fmtMoney(c.cpc || 0)}</span>
                  <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-2)" }}>{fmtNum(c.clicks)}</span>
                </div>
              ))}
          </div>
        </Card>
        <Card pad={20}>
          <SectionTitle>Dépenses par zone</SectionTitle>
          <WorldMap data={data.geo_breakdown || []} height={300} />
        </Card>
      </div>
    </div>
  );
}
