import { AlertTriangle } from "lucide-react";
import { useMetaAccounts } from "../hooks/useMetaAccounts";

const ALERT = "#F43F5E"; // Couleur "Alerte" du design system.

/** Bannière affichée dès qu'un compte Meta a un token expiré (détecté par le
 *  worker de sync). Lit la liste des comptes via React Query — se met donc à jour
 *  automatiquement après un refresh. Rend `null` si tous les tokens sont valides. */
export function TokenAlertBanner({ onGoToSettings }: { onGoToSettings?: () => void }) {
  const { data: accounts } = useMetaAccounts();
  const expired = (accounts || []).filter((a) => a.token_status === "expired");
  if (expired.length === 0) return null;

  const labels = expired.map((a) => `« ${a.label} »`).join(", ");
  const msg =
    expired.length === 1
      ? `Le token Meta du compte ${labels} a expiré.`
      : `Les tokens Meta des comptes ${labels} ont expiré.`;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        marginBottom: 16,
        borderRadius: 10,
        background: `color-mix(in srgb, ${ALERT} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ALERT} 35%, transparent)`,
        color: "var(--tx)",
      }}
    >
      <AlertTriangle size={18} style={{ color: ALERT, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
        {msg} La synchronisation des données est interrompue — mets-le à jour dans les Paramètres.
      </span>
      {onGoToSettings && (
        <button
          onClick={onGoToSettings}
          style={{
            flexShrink: 0,
            height: 32,
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: ALERT,
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: "IBM Plex Sans",
          }}
        >
          Mettre à jour le token
        </button>
      )}
    </div>
  );
}
