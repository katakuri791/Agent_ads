import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, KeyRound, XCircle } from "lucide-react";
import { useNotifications, useNotificationMutations } from "../hooks/useNotifications";
import type { AppNotification } from "../lib/api";

/** Temps relatif court en français ("à l'instant", "il y a 3 min", "il y a 2 h"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function iconFor(type: string) {
  if (type === "token_expired") return <KeyRound size={15} style={{ color: "#F43F5E" }} />;
  if (type === "campaign_failed") return <XCircle size={15} style={{ color: "#F59E0B" }} />;
  return <AlertTriangle size={15} style={{ color: "#F59E0B" }} />;
}

export function NotificationBell({ onGoToSettings }: { onGoToSettings?: () => void }) {
  const { data } = useNotifications();
  const { markRead, markAllRead } = useNotificationMutations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = data?.items || [];
  const unread = data?.unread_count || 0;

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onItemClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.type === "token_expired" && onGoToSettings) {
      setOpen(false);
      onGoToSettings();
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="ms-icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{ position: "relative", width: 36, height: 36, borderRadius: 8, background: "transparent", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#F43F5E", color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--bg)" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: 44, right: 0, width: 340, maxHeight: 420, overflowY: "auto", background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 12, boxShadow: "0 24px 70px rgba(0,0,0,.6)", zIndex: 60 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--bd)" }}>
            <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>Notifications</span>
            {unread > 0 && (
              <button onClick={() => markAllRead.mutate()} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 12, fontWeight: 600, fontFamily: "IBM Plex Sans" }}>
                <CheckCheck size={13} /> Tout lire
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucune notification.</div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => onItemClick(n)}
                style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, padding: "11px 14px", border: "none", borderBottom: "1px solid var(--bd)", cursor: "pointer", background: n.read ? "transparent" : "color-mix(in srgb, var(--accent) 6%, transparent)" }}
              >
                <span style={{ marginTop: 1, flexShrink: 0 }}>{iconFor(n.type)}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--tx)", marginBottom: 2 }}>{n.title}</span>
                  {n.body && <span style={{ display: "block", fontSize: 12, color: "var(--tx-3)", lineHeight: 1.4, marginBottom: 4 }}>{n.body}</span>}
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--tx-dim)" }}>{relativeTime(n.created_at)}</span>
                    {n.type === "token_expired" && (
                      <span style={{ fontSize: 11, color: "#F43F5E", fontWeight: 600 }}>Mettre à jour le token →</span>
                    )}
                  </span>
                </span>
                {!n.read && <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--accent)", flexShrink: 0, marginTop: 5 }} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
