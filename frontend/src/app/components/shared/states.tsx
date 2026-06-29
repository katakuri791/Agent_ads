import { AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { EmptyState, MSButton } from "../ms/primitives";

/** Affiché quand Meta n'est pas configuré (400) — invite à aller dans Settings. */
export function ConnectPrompt({ onGoToSettings, message }: { onGoToSettings: () => void; message?: string }) {
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

/** Bandeau d'erreur non destructif (ambre) — garde la page affichée. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
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

/** État d'erreur centré (aucune donnée à afficher) avec Retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "64px 20px", gap: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "#F59E0B12", border: "1px solid #F59E0B30", display: "flex", alignItems: "center", justifyContent: "center", color: "#F59E0B" }}>
        <AlertTriangle size={28} />
      </div>
      <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "var(--tx)" }}>Impossible de charger les données</div>
      <div style={{ fontSize: 13, color: "var(--tx-3)", maxWidth: 420, lineHeight: 1.5, fontFamily: "JetBrains Mono" }}>{message}</div>
      {onRetry && <div style={{ marginTop: 6 }}><MSButton variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>Réessayer</MSButton></div>}
    </div>
  );
}

export const OBJ_COLORS = ["var(--accent)", "#22C55E", "#F59E0B", "#A855F7", "#EC4899", "#06B6D4", "#EF4444"];
