import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2 } from "lucide-react";
import { useMetaAccounts } from "../../hooks/useMetaAccounts";
import { useAccount } from "../../providers/AccountProvider";

/** Filtre global « clé API Meta » (multi-comptes). Sélectionne UN compte ; tout
 *  le dashboard reflète ce compte. Visible dans la topbar. */
export function AccountFilter({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { data: accounts } = useMetaAccounts();
  const { selectedAccountId, setSelectedAccountId } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);

  // Le compte « courant » : le sélectionné, sinon le défaut, sinon le premier.
  const list = accounts || [];
  const current =
    list.find((a) => a.id === selectedAccountId) || list.find((a) => a.is_default) || list[0] || null;

  if (list.length === 0) {
    return (
      <button onClick={onGoToSettings} className="ms-btn" style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 8, background: "#111318", border: "1px solid #1E2128", color: "#9AA1AC", fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer" }}>
        <Link2 size={14} style={{ color: "#6B7280" }} />
        <span>Aucun compte connecté</span>
      </button>
    );
  }

  const label = current?.label || current?.meta_ad_account_id || "Compte Meta";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title={current?.meta_ad_account_id || undefined} className="ms-btn"
        style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 12px", borderRadius: 8, background: "#111318", border: "1px solid " + (open ? "#1877F2" : "#1E2128"), color: "#D1D5DB", fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer" }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: "#1877F2", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{label[0]?.toUpperCase()}</span>
        <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={14} style={{ color: "#6B7280" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, minWidth: 240, background: "#16181F", border: "1px solid #1E2128", borderRadius: 10, padding: 6, zIndex: 60, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          {list.map((a) => {
            const active = current?.id === a.id;
            return (
              <button key={a.id} className="ms-menu-item" onClick={() => { setSelectedAccountId(a.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 10px", fontSize: 12.5, color: active ? "#F9FAFB" : "#D1D5DB", background: active ? "#1877F215" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: a.meta_access_token_set ? "#1877F2" : "#2A2E37", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{(a.label || "M")[0]?.toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                  <span style={{ display: "block", fontFamily: "JetBrains Mono", fontSize: 10.5, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.meta_ad_account_id || "—"}{a.is_default ? " · défaut" : ""}</span>
                </span>
                {active && <Check size={14} style={{ color: "#1877F2", flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ borderTop: "1px solid #1E2128", margin: "6px 4px 4px" }} />
          <button className="ms-menu-item" onClick={() => { onGoToSettings(); setOpen(false); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12, color: "#9AA1AC", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
            + Gérer les clés API
          </button>
        </div>
      )}
    </div>
  );
}
