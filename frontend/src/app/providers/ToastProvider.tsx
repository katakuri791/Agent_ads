import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

export type Toast = { id: number; title: string; msg?: string; kind?: "info" | "success" | "error" };
type ToastFn = (title: string, opts?: { msg?: string; kind?: Toast["kind"]; duration?: number }) => void;

const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 18, right: 18, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
      {toasts.map((t) => {
        const col = t.kind === "error" ? "#EF4444" : t.kind === "success" ? "#22C55E" : "var(--accent)";
        return (
          <div key={t.id} className="ms-msg" style={{ display: "flex", alignItems: "flex-start", gap: 10, width: 320, background: "var(--surf-pop)", border: "1px solid " + col + "40", borderLeft: "3px solid " + col, borderRadius: 10, padding: "12px 14px", boxShadow: "0 14px 40px rgba(0,0,0,.5)", pointerEvents: "auto" }}>
            <span style={{ color: col, display: "inline-flex", marginTop: 1 }}>{t.kind === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{t.title}</div>
              {t.msg && <div style={{ fontSize: 12, color: "var(--tx-3)", marginTop: 2 }}>{t.msg}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} style={{ background: "none", border: "none", color: "var(--tx-dim)", cursor: "pointer", display: "inline-flex" }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback<ToastFn>((title, opts = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, msg: opts.msg, kind: opts.kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <ToastHost toasts={toasts} dismiss={dismiss} />
    </ToastCtx.Provider>
  );
}
