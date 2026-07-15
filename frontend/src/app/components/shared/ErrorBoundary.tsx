import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Capture toute exception de rendu d'une page pour éviter l'écran blanc global.
 *  Affiche le message + la stack (dev) et permet de retenter le rendu.
 *  `resetKey` : quand il change (ex. changement de page), l'erreur est réinitialisée. */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string | number },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Trace complète dans la console pour le debug.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string | number }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Message SIMPLE côté client — aucun jargon technique affiché par défaut.
    // Le détail complet reste dans la console (componentDidCatch) + un repli discret.
    return (
      <div style={{ padding: 40, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "color-mix(in srgb, #F59E0B 12%, transparent)", color: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <AlertTriangle size={26} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--tx)", marginBottom: 8 }}>
          Un problème est survenu
        </div>
        <div style={{ fontSize: 13.5, color: "var(--tx-3)", lineHeight: 1.55, marginBottom: 20 }}>
          Impossible de récupérer les informations pour le moment. Réessaie dans un instant.
          Si ça continue, rafraîchis la page ou reviens un peu plus tard.
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "#fff", background: "var(--accent)", border: "none", borderRadius: 9, padding: "10px 18px", cursor: "pointer" }}
        >
          <RefreshCw size={15} /> Réessayer
        </button>
        <details style={{ marginTop: 22, textAlign: "left" }}>
          <summary style={{ fontSize: 11.5, color: "var(--tx-dim)", cursor: "pointer", listStyle: "none" }}>Détails techniques</summary>
          <pre style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--tx-dim)", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 10, padding: "12px 14px", marginTop: 8, overflow: "auto", maxHeight: 220, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {error.name}: {error.message}{error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>
      </div>
    );
  }
}
