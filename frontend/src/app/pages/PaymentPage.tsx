import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, RefreshCw } from "lucide-react";
import { fmtMoney, fmtNum } from "../lib/format";
import type { CampaignSummary } from "../lib/api";
import { Card, SectionTitle, LoadingOverlay, MSButton } from "../components/ms/primitives";
import { BarChart } from "../components/ms/charts";
import { ConnectPrompt, ErrorBanner, ErrorState } from "../components/shared/states";
import { useBilling, useCampaignsOnDay, errStatus, errMessage } from "../hooks/useMetaData";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 19, color: color || "var(--tx)" }}>{value}</div>
    </div>
  );
}

/** Barre animée « dépensé → budget » : se remplit de 0 jusqu'au ratio dépensé/budget
 *  au montage. Vert < 80 %, ambre ≥ 80 %, rouge quand la dépense atteint le budget. */
function BudgetBar({ spent, budget, money }: { spent: number; budget: number | null; money: (v?: number | null) => string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);
  const hasBudget = budget != null && budget > 0;
  const raw = hasBudget ? spent / (budget as number) : 0;
  const ratio = Math.min(raw, 1);
  const pct = Math.round(raw * 100);
  const color = !hasBudget ? "var(--tx-dim)" : raw >= 1 ? "#F43F5E" : raw >= 0.8 ? "#F59E0B" : "var(--accent)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, gap: 10 }}>
        <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: "var(--tx)", fontWeight: 600 }}>{money(spent)}</span>
        <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>{hasBudget ? `budget ${money(budget)}` : "budget géré au niveau adset"}</span>
      </div>
      <div style={{ position: "relative", height: 9, borderRadius: 999, background: "var(--surf-2)", overflow: "hidden" }}>
        {/* Remplissage animé via transform:scaleX (pas de reflow, contrairement à width). */}
        <div style={{ height: "100%", width: "100%", borderRadius: 999, background: color, transformOrigin: "left center", transform: `scaleX(${mounted ? ratio : 0})`, transition: "transform 800ms cubic-bezier(.4,0,.2,1)" }} />
      </div>
      {hasBudget && (
        <div style={{ textAlign: "right", marginTop: 4, fontFamily: "JetBrains Mono", fontSize: 11, color }}>{pct}% du budget</div>
      )}
    </div>
  );
}

/** Une campagne « en train de dépenser » ce jour-là (dépense + barre budget). */
function SpendRow({ c, money }: { c: CampaignSummary; money: (v?: number | null) => string }) {
  const budgetUnits = c.daily_budget != null ? c.daily_budget / 100 : null; // centimes → unités
  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ fontSize: 13, color: "var(--tx)", fontWeight: 500, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
      <BudgetBar spent={c.spend || 0} budget={budgetUnits} money={money} />
    </div>
  );
}

export function PaymentPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const billQ = useBilling();
  const bill = billQ.data ?? null;

  // ⚠️ Tous les hooks AVANT tout `return` anticipé (règle des Hooks React).
  const [year, setYear] = useState<string>("all");
  // Filtre par jour du suivi budget/dépense (défaut : aujourd'hui, format YYYY-MM-DD).
  const [day, setDay] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const dayCampsQ = useCampaignsOnDay(day);
  // Filtre par année : années réellement présentes dans l'historique (mois = YYYY-MM).
  const years = useMemo(
    () => Array.from(new Set((bill?.history || []).map((m) => m.month.slice(0, 4)))).sort().reverse(),
    [bill],
  );

  if (!billQ.data) {
    if (errStatus(billQ.error) === 400)
      return <ConnectPrompt onGoToSettings={onGoToSettings} message="Connecte ton compte Meta dans Settings pour voir la facturation." />;
    if (billQ.isError)
      return <ErrorState message={errMessage(billQ.error) || "Erreur"} onRetry={() => billQ.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Récupération de la facturation Meta…"]} />;
  }

  const cur = bill?.currency ? ` ${bill.currency}` : "";
  const money = (v?: number | null) => (v == null ? "—" : fmtMoney(v) + (cur && !"$€£".includes(fmtMoney(v)[0]) ? cur : ""));

  // Défaut sûr : si "all" mais qu'il existe des années, on garde "all" (tout l'historique).
  const months = bill?.history || [];
  const filteredMonths = year === "all" ? months : months.filter((m) => m.month.startsWith(year));
  const history = filteredMonths.map((m) => ({ name: m.month, value: m.spend }));
  const totalHist = history.reduce((s, h) => s + (h.value || 0), 0);
  const totalImpr = filteredMonths.reduce((s, h) => s + h.impressions, 0);
  const cardCount = bill?.card_count ?? null;

  // Campagnes « en train de dépenser » le jour sélectionné (dépense > 0), triées.
  const spendingCamps = (dayCampsQ.data ?? [])
    .filter((c) => (c.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const daySpend = spendingCamps.reduce((s, c) => s + (c.spend || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => billQ.refetch()}>Rafraîchir</MSButton>
      </div>

      {/* ── Paiement ──────────────────────────────────────────────────────── */}
      <Card pad={20} style={{ position: "relative" }}>
        {billQ.isFetching && billQ.data && <LoadingOverlay messages={["Mise à jour de la facturation…"]} />}
        <SectionTitle>Paiement &amp; facturation</SectionTitle>
        {billQ.isError && <div style={{ marginBottom: 12 }}><ErrorBanner message={errMessage(billQ.error) || "Erreur"} onRetry={() => billQ.refetch()} /></div>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "linear-gradient(135deg,color-mix(in srgb, var(--accent) 8%, transparent),transparent)", border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)", borderRadius: 12, marginBottom: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CreditCard size={20} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 3 }}>Moyen de paiement</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tx)" }}>
              {bill?.payment_type || bill?.payment_display || "Non renseigné"}
              {bill?.payment_type && bill?.payment_display ? <span style={{ fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-3)", marginLeft: 8 }}>{bill.payment_display}</span> : null}
            </div>
          </div>
          {cardCount != null && (
            <div style={{ textAlign: "center", flexShrink: 0, paddingLeft: 12, borderLeft: "1px solid var(--bd)" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 19, color: "var(--tx)" }}>{cardCount}</div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginTop: 2 }}>{cardCount > 1 ? "cartes" : "carte"}</div>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <Stat label="Total dépensé" value={money(bill?.amount_spent)} />
          <Stat label="Solde dû" value={money(bill?.balance)} color={(bill?.balance || 0) > 0 ? "#F59E0B" : undefined} />
          <Stat label="Seuil de dépense" value={bill?.spend_cap ? money(bill.spend_cap) : "Aucun"} />
          <Stat label="Statut du compte" value={bill?.account_status || "—"} />
        </div>
      </Card>

      {/* ── Budget en cours de consommation (jour sélectionné) ────────────── */}
      <Card pad={20} style={{ position: "relative" }}>
        {dayCampsQ.isFetching && <LoadingOverlay messages={["Chargement des dépenses du jour…"]} />}
        <SectionTitle right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="date"
              value={day}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDay(e.target.value || day)}
              style={{ fontSize: 12, color: "var(--tx-2)", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}
            />
            {spendingCamps.length > 0 && <span style={{ fontSize: 12, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>{money(daySpend)} ce jour</span>}
          </div>
        }>
          Budget en cours de consommation
        </SectionTitle>
        {dayCampsQ.isError ? (
          <div style={{ padding: 20 }}><ErrorBanner message="Impossible de charger les dépenses du jour." onRetry={() => dayCampsQ.refetch()} /></div>
        ) : spendingCamps.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucune campagne en train de dépenser ce jour-là.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {spendingCamps.map((c) => <SpendRow key={`${c.id}-${day}`} c={c} money={money} />)}
          </div>
        )}
      </Card>

      {/* ── Historique de dépense (vraies dépenses mensuelles) ────────────── */}
      <Card pad={20}>
        <SectionTitle right={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {years.length > 0 && (
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{ fontSize: 12, color: "var(--tx-2)", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}
              >
                <option value="all">Toutes les années</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <span style={{ fontSize: 12, color: "var(--tx-dim)" }}>Dépense mensuelle réelle</span>
          </div>
        }>
          Historique de dépense
        </SectionTitle>
        {history.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucun historique de dépense sur cette période.</div>
        ) : (
          <>
            <BarChart data={history} height={220} valueFormat={(v) => money(v)} />
            <div style={{ fontSize: 11.5, color: "var(--tx-dim)", marginTop: 10, display: "flex", gap: 8 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>L'API Meta n'expose pas les factures détaillées. Cette chronologie est reconstruite à partir des vraies dépenses synchronisées ({totalHist > 0 ? money(totalHist) + " au total" : "—"}, {fmtNum(totalImpr)} impressions).</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
