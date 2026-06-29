import { AlertTriangle, RefreshCw } from "lucide-react";
import { useSyncStatus, useTriggerSync } from "../../hooks/useMetaData";

/** Temps relatif compact : « à l'instant », « il y a 5 min », « il y a 2 h ». */
function relativeTime(iso?: string | null): string {
  if (!iso) return "jamais";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "jamais";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** Indicateur global de fraîcheur du cache : « Maj il y a N min » + bouton
 *  Refresh (déclenche un sync Meta → Supabase) + avertissement si le dernier
 *  sync a échoué. Le dashboard lit le cache ; ceci pilote sa mise à jour. */
export function SyncIndicator() {
  const status = useSyncStatus();
  const trigger = useTriggerSync();
  const s = status.data;
  const accountId = s?.account_id;
  const isError = s?.last_sync_status === "error";
  const busy = trigger.isPending || s?.running || s?.last_sync_status === "running";

  const onRefresh = () => {
    if (accountId && !busy) trigger.mutate(accountId);
  };

  const label = busy
    ? "Synchronisation…"
    : isError
      ? "Échec du dernier sync"
      : `Maj ${relativeTime(s?.last_sync_at)}`;

  return (
    <div
      title={isError ? s?.last_error || "Erreur de synchronisation" : "Dernière synchronisation des données Meta"}
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: isError ? "#F43F5E" : "var(--tx-3)" }}
    >
      {isError && <AlertTriangle size={14} />}
      <span style={{ whiteSpace: "nowrap", fontFamily: "JetBrains Mono", fontSize: 11.5 }}>{label}</span>
      <button
        onClick={onRefresh}
        disabled={!accountId || busy}
        title="Rafraîchir les données depuis Meta"
        style={{
          width: 32, height: 32, borderRadius: 8, background: "transparent",
          border: "1px solid var(--bd)", color: isError ? "#F43F5E" : "var(--tx-3)",
          cursor: !accountId || busy ? "default" : "pointer", opacity: !accountId || busy ? 0.6 : 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
      </button>
    </div>
  );
}
