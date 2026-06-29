import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import type { DateRange } from "../../lib/api";
import { useFilters } from "../../providers/FiltersProvider";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Presets façon Meta Ads. Chacun produit une `DateRange` (preset relatif ou
 *  fenêtre since/until calculée côté client) + un libellé. */
function buildPresets(): Array<{ label: string; range: DateRange }> {
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label: "Aujourd'hui", range: { since: iso(today), until: iso(today) } },
    { label: "Hier", range: { since: iso(yest), until: iso(yest) } },
    { label: "7 derniers jours", range: { preset: "last_7d" } },
    { label: "14 derniers jours", range: { preset: "last_14d" } },
    { label: "30 derniers jours", range: { preset: "last_30d" } },
    { label: "90 derniers jours", range: { preset: "last_90d" } },
    { label: "Ce mois-ci", range: { since: iso(firstThisMonth), until: iso(today) } },
    { label: "Le mois dernier", range: { since: iso(firstLastMonth), until: iso(lastLastMonth) } },
    { label: "Maximum", range: { preset: "maximum" } },
  ];
}

/** Filtre date global (façon Meta Ads) — alimente Overview + Campagnes via
 *  FiltersProvider. */
export function DateRangeFilter() {
  const { range, rangeLabel, setRange } = useFilters();
  const [open, setOpen] = useState(false);
  const [customSince, setCustomSince] = useState(range.since || "");
  const [customUntil, setCustomUntil] = useState(range.until || "");
  const ref = useRef<HTMLDivElement>(null);
  const presets = buildPresets();

  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);

  const applyCustom = () => {
    if (!customSince || !customUntil) return;
    setRange({ since: customSince, until: customUntil }, `${customSince} → ${customUntil}`);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="ms-btn"
        style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 8, background: "var(--surf-card)", border: "1px solid " + (open ? "var(--accent)" : "var(--bd)"), color: "var(--tx-2)", fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer" }}>
        <Calendar size={14} style={{ color: "var(--tx-dim)" }} />
        <span style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rangeLabel}</span>
        <ChevronDown size={14} style={{ color: "var(--tx-dim)" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 260, background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 10, padding: 6, zIndex: 60, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          {presets.map((p) => {
            const active = rangeLabel === p.label;
            return (
              <button key={p.label} className="ms-menu-item" onClick={() => { setRange(p.range, p.label); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12.5, color: active ? "var(--tx)" : "var(--tx-2)", background: active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
                {p.label}
              </button>
            );
          })}
          <div style={{ borderTop: "1px solid var(--bd)", margin: "6px 4px", paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: "var(--tx-dim)", padding: "0 6px 6px" }}>Personnalisé</div>
            <div style={{ display: "flex", gap: 6, padding: "0 6px" }}>
              <input type="date" value={customSince} onChange={(e) => setCustomSince(e.target.value)} style={dateInput} />
              <input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} style={dateInput} />
            </div>
            <div style={{ padding: "8px 6px 2px" }}>
              <button onClick={applyCustom} disabled={!customSince || !customUntil}
                style={{ width: "100%", height: 32, borderRadius: 7, border: "none", background: customSince && customUntil ? "var(--accent)" : "var(--sw)", color: "#fff", fontSize: 12.5, fontWeight: 500, cursor: customSince && customUntil ? "pointer" : "default", fontFamily: "IBM Plex Sans" }}>
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const dateInput: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 32, background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 7,
  padding: "0 8px", fontSize: 12, color: "var(--tx-2)", fontFamily: "JetBrains Mono", outline: "none",
};
