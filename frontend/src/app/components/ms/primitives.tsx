// MetaScope shared UI primitives (ported from the prototype's components.jsx).
// Icons come from lucide-react (already a project dep).
import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { ArrowUp, ArrowDown, Search, ChevronDown, Check, ArrowRight, Inbox, Calendar, Moon, Sun } from "lucide-react";
import { Sparkline } from "./charts";
import { useCountUp, Blob, blobFor, EASE } from "./motion";

// ─── Card ───────────────────────────────────────────────────────
export function Card({ children, style, pad = 20, className = "", ...rest }: {
  children?: ReactNode; style?: CSSProperties; pad?: number; className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={"ms-card " + className} style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: pad, ...style }} {...rest}>
      {children}
    </div>
  );
}

// ─── ChangeBadge ────────────────────────────────────────────────
export function ChangeBadge({ change, dir }: { change: number; dir?: "up" | "down" }) {
  const up = dir ? dir === "up" : change >= 0;
  const col = up ? "#22C55E" : "#EF4444";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className="ms-chip-hover" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: col, background: col + "18", borderRadius: 999, padding: "2px 7px", fontFamily: "JetBrains Mono" }}>
      <Icon size={12} strokeWidth={2.4} />
      {Math.abs(change).toFixed(1) + "%"}
    </span>
  );
}

// ─── KPICard ────────────────────────────────────────────────────
export interface Kpi { label: string; value: string; change?: number | null; dir?: "up" | "down"; spark?: number[]; }
export function KPICard({ kpi, idx = 0, color = "var(--accent)", decorate = true }: { kpi: Kpi; idx?: number; color?: string; decorate?: boolean }) {
  const [show, setShow] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, lift: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60 + idx * 45); return () => clearTimeout(t); }, [idx]);
  // Le count-up anime la valeur de 0 → cible en conservant préfixe/suffixe (€, %, x…).
  const animated = useCountUp(kpi.value, { delay: 120 + idx * 45, duration: 1150 });
  const deco = blobFor(idx);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (px - 0.5) * 6, y: (0.5 - py) * 6, lift: 1 });
  };
  const onLeave = () => setTilt({ x: 0, y: 0, lift: 0 });

  const liftTransform = tilt.lift
    ? `perspective(700px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg) translateY(-5px) scale(1.018)`
    : (show ? "perspective(700px) translateY(0)" : "perspective(700px) translateY(12px)");

  return (
    <div ref={ref} className="ms-card ms-kpi" onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ position: "relative", overflow: "hidden", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, opacity: show ? 1 : 0, transform: liftTransform, transition: `opacity .5s ${EASE.smooth}, transform .35s ${EASE.springSoft}, border-color .2s, box-shadow .3s`, boxShadow: tilt.lift ? "0 18px 44px rgba(0,0,0,.28)" : "0 0 0 transparent", transformStyle: "preserve-3d" }}>
      {decorate && <Blob kind={deco.kind} color={deco.color} opacity={0.14} size={90} top={-18} right={-14} rotate={-10 + (idx % 3) * 6} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, position: "relative" }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tx-dim)", fontWeight: 500 }}>{kpi.label}</span>
        {kpi.change != null && <ChangeBadge change={kpi.change} dir={kpi.dir} />}
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 27, color: "var(--tx)", lineHeight: 1.05, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum' 1", position: "relative" }}>{animated}</div>
      <div style={{ height: 36, marginTop: 2, position: "relative" }}>{kpi.spark && kpi.spark.length > 0 && <Sparkline data={kpi.spark} color={color} height={36} />}</div>
    </div>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────
const BADGE: Record<string, [string, string, string]> = {
  ACTIVE: ["#22C55E", "#22C55E15", "#22C55E30"], PAUSED: ["#F59E0B", "#F59E0B15", "#F59E0B30"],
  ARCHIVED: ["var(--tx-3)", "#6B728020", "#6B728040"], DELETED: ["#EF4444", "#EF444415", "#EF444430"],
  Ready: ["#22C55E", "#22C55E15", "#22C55E30"], Updating: ["#F59E0B", "#F59E0B15", "#F59E0B30"], "Too Small": ["#EF4444", "#EF444415", "#EF444430"],
  Valid: ["#22C55E", "#22C55E15", "#22C55E30"], Expired: ["#EF4444", "#EF444415", "#EF444430"], Error: ["#F59E0B", "#F59E0B15", "#F59E0B30"],
  Custom: ["var(--accent)", "color-mix(in srgb, var(--accent) 8%, transparent)", "color-mix(in srgb, var(--accent) 19%, transparent)"], Lookalike: ["#A855F7", "#A855F715", "#A855F730"], Saved: ["var(--tx-3)", "#6B728020", "#6B728040"], "Special Ad": ["#F59E0B", "#F59E0B15", "#F59E0B30"],
};
export function StatusBadge({ status, dot = false }: { status: string; dot?: boolean }) {
  const [c, bg, bd] = BADGE[status] || BADGE.ARCHIVED;
  return (
    <span className="ms-chip-hover" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: c, background: bg, border: "1px solid " + bd, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: 999, background: c }} />}
      {status}
    </span>
  );
}

// ─── Button ─────────────────────────────────────────────────────
type Variant = "primary" | "outline" | "ghost" | "soft";
export function MSButton({ children, variant = "ghost", icon, onClick, style, danger, active, size = "md", type = "button", disabled, title }: {
  children?: ReactNode; variant?: Variant; icon?: ReactNode; onClick?: () => void; style?: CSSProperties;
  danger?: boolean; active?: boolean; size?: "sm" | "md"; type?: "button" | "submit"; disabled?: boolean; title?: string;
}) {
  const pads = size === "sm" ? "5px 10px" : "8px 14px";
  const fs = size === "sm" ? 12 : 13;
  const base: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: fs, fontWeight: 500, fontFamily: "IBM Plex Sans", borderRadius: 8, padding: pads, cursor: disabled ? "default" : "pointer", border: "1px solid transparent", transition: "all .15s", whiteSpace: "nowrap", lineHeight: 1.2 };
  const variants: Record<Variant, CSSProperties> = {
    primary: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
    outline: { background: "transparent", color: danger ? "#EF4444" : "var(--tx-2)", borderColor: danger ? "#EF444450" : "var(--sw)" },
    ghost: { background: active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", color: active ? "var(--accent)" : "var(--tx-3)", borderColor: "transparent" },
    soft: { background: "var(--surf-3)", color: "var(--tx-2)", borderColor: "var(--bd-strong)" },
  };
  return (
    <button className={"ms-btn ms-btn-" + variant} onClick={onClick} type={type} disabled={disabled} title={title} style={{ ...base, ...variants[variant], ...(disabled ? { opacity: 0.5 } : {}), ...style }}>
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
    </button>
  );
}

// ─── Switch (toggle iOS) ────────────────────────────────────────
export function Switch({ checked, onChange, disabled, title, onColor = "#22C55E" }: {
  checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; title?: string; onColor?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} title={title} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      style={{ width: 38, height: 22, borderRadius: 999, border: "none", padding: 0, position: "relative", cursor: disabled ? "wait" : "pointer", background: checked ? onColor : "var(--sw)", opacity: disabled ? 0.55 : 1, transition: "background .2s ease", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)", transition: "left .2s cubic-bezier(.34,1.56,.64,1)" }} />
    </button>
  );
}

// ─── ThemeToggle (lune / soleil) ────────────────────────────────
export function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="ms-icon-btn" title={dark ? "Passer en clair" : "Passer en sombre"}
      style={{ position: "relative", width: 36, height: 36, borderRadius: 8, background: "transparent", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <span style={{ display: "inline-flex", transition: "transform .45s cubic-bezier(.34,1.56,.64,1)", transform: dark ? "rotate(0deg)" : "rotate(180deg)" }}>{dark ? <Moon size={18} /> : <Sun size={18} />}</span>
    </button>
  );
}

// ─── SearchBar ──────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder, width = 320 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: "relative", width }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tx-dim)", display: "inline-flex" }}><Search size={16} /></span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ width: "100%", height: 40, background: "var(--surf-card)", border: "1px solid " + (focus ? "var(--accent)" : "var(--bd)"), borderRadius: 8, padding: "0 12px 0 38px", fontSize: 14, color: "var(--tx-2)", fontFamily: "IBM Plex Sans", outline: "none", transition: "border-color .15s" }} />
    </div>
  );
}

// ─── FilterPill (dropdown) ──────────────────────────────────────
export function FilterPill({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const active = value && value !== "All";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="ms-btn" onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 8, fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer", background: active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--surf-card)", border: "1px solid " + (active ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "var(--bd)"), color: active ? "var(--accent)" : "var(--tx-3)" }}>
        <span>{label + (active ? ": " + value : "")}</span>
        <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><ChevronDown size={14} /></span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, left: 0, minWidth: 160, background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 8, padding: 5, zIndex: 30, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          {options.map((o, i) => (
            <button key={i} className="ms-menu-item" onClick={() => { onChange(o); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, color: o === value ? "var(--tx)" : "var(--tx-3)", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
              <span>{o}</span>
              {o === value && <span style={{ color: "var(--accent)", display: "inline-flex" }}><Check size={14} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DateRangePicker (presets + custom Du/Au) ───────────────────
export type DateRange = { preset?: string; since?: string; until?: string };
const DATE_PRESETS: Array<{ label: string; preset: string }> = [
  { label: "Aujourd'hui", preset: "today" },
  { label: "Hier", preset: "yesterday" },
  { label: "7 derniers jours", preset: "last_7d" },
  { label: "14 derniers jours", preset: "last_14d" },
  { label: "30 derniers jours", preset: "last_30d" },
  { label: "90 derniers jours", preset: "last_90d" },
  { label: "Ce mois-ci", preset: "this_month" },
  { label: "Mois dernier", preset: "last_month" },
  { label: "Maximum", preset: "maximum" },
];

export function DateRangePicker({ label, activePreset, onChange }: {
  label: string; activePreset?: string; onChange: (range: DateRange, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const pickPreset = (p: { label: string; preset: string }) => { onChange({ preset: p.preset }, p.label); setOpen(false); };
  // A single date (only "Du" or only "Au" filled) selects that exact day; both
  // filled select the range. This makes "pick a precise date" actually filter.
  const applyCustom = () => {
    const s = since || until;
    const u = until || since;
    if (!s || !u) return;
    onChange({ since: s, until: u }, s === u ? s : `${s} → ${u}`);
    setOpen(false);
  };
  const inputStyle: CSSProperties = { height: 34, background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 7, padding: "0 8px", fontSize: 12.5, color: "var(--tx-2)", fontFamily: "IBM Plex Sans", colorScheme: "dark", outline: "none", width: "100%" };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="ms-btn" onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 12px", borderRadius: 8, fontSize: 13, fontFamily: "IBM Plex Sans", cursor: "pointer", background: "var(--surf-card)", border: "1px solid var(--bd)", color: "var(--tx-2)" }}>
        <Calendar size={14} style={{ color: "var(--tx-dim)" }} />
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--tx-dim)" }}><ChevronDown size={14} /></span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 300, background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 10, padding: 8, zIndex: 40, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {DATE_PRESETS.map((p) => (
              <button key={p.preset} className="ms-menu-item" onClick={() => pickPreset(p)}
                style={{ textAlign: "left", padding: "7px 9px", fontSize: 12.5, color: p.preset === activePreset ? "var(--tx)" : "var(--tx-3)", background: p.preset === activePreset ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "IBM Plex Sans" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--bd)", marginTop: 8, paddingTop: 10 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 8 }}>Date précise ou plage</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ flex: 1 }}><span style={{ fontSize: 11, color: "var(--tx-dim)", display: "block", marginBottom: 3 }}>Du</span><input type="date" value={since} max={until || undefined} onChange={(e) => setSince(e.target.value)} style={inputStyle} /></label>
              <label style={{ flex: 1 }}><span style={{ fontSize: 11, color: "var(--tx-dim)", display: "block", marginBottom: 3 }}>Au</span><input type="date" value={until} min={since || undefined} onChange={(e) => setUntil(e.target.value)} style={inputStyle} /></label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <MSButton variant="ghost" size="sm" onClick={() => setOpen(false)}>Annuler</MSButton>
              <MSButton variant="primary" size="sm" onClick={applyCustom} disabled={!since && !until}>Appliquer</MSButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────
export function Tabs({ tabs, value, onChange, size = "md" }: { tabs: string[]; value: string; onChange: (t: string) => void; size?: "sm" | "md" }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 9, padding: 3, width: "fit-content" }}>
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className="ms-btn"
          style={{ padding: size === "sm" ? "5px 12px" : "7px 16px", fontSize: size === "sm" ? 12 : 13, fontWeight: 500, fontFamily: "IBM Plex Sans", borderRadius: 6, border: "none", cursor: "pointer", background: value === t ? "var(--accent)" : "transparent", color: value === t ? "#fff" : "var(--tx-3)", transition: "all .15s" }}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── SlidePanel ─────────────────────────────────────────────────
export function SlidePanel({ open, onClose, children, width = 480 }: { open: boolean; onClose: () => void; children?: ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, overflow: "hidden", pointerEvents: open ? "auto" : "none" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", opacity: open ? 1 : 0, transition: "opacity .25s" }} />
      <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width, maxWidth: "92%", background: "var(--bg)", borderLeft: "1px solid var(--bd)", boxShadow: "-20px 0 60px rgba(0,0,0,.4)", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform .28s cubic-bezier(.4,0,.2,1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle, cta, onCta }: { icon?: ReactNode; title: string; subtitle?: string; cta?: string; onCta?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "64px 20px", gap: 6 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "color-mix(in srgb, var(--accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", marginBottom: 10 }}>
        {icon || <Inbox size={30} />}
      </div>
      <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "var(--tx)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13.5, color: "var(--tx-dim)", maxWidth: 320, lineHeight: 1.5 }}>{subtitle}</div>}
      {cta && <div style={{ marginTop: 14 }}><MSButton variant="primary" onClick={onCta} icon={<ArrowRight size={15} />}>{cta}</MSButton></div>}
    </div>
  );
}

// ─── Spinner (basic spinning + rotating messages) ──────────────
const LOADING_MESSAGES = [
  "Chargement des données…",
  "Ça peut prendre quelques secondes…",
  "Récupération des données depuis Meta…",
];
export function Spinner({ message, messages, size = 34, inline = false }: {
  message?: string; messages?: string[]; size?: number; inline?: boolean;
}) {
  const cycle = messages ?? (message ? [message] : LOADING_MESSAGES);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (cycle.length <= 1) return;
    const t = setInterval(() => setI((n) => (n + 1) % cycle.length), 2600);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle.length]);
  const border = Math.max(2, Math.round(size / 11));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: inline ? 0 : 48 }}>
      <div className="animate-spin" style={{ width: size, height: size, borderRadius: 999, border: `${border}px solid var(--bd)`, borderTopColor: "var(--accent)" }} />
      {cycle.length > 0 && (
        <div style={{ fontSize: 13, color: "var(--tx-3)", fontFamily: "IBM Plex Sans", textAlign: "center", minHeight: 18 }}>{cycle[i] ?? cycle[0]}</div>
      )}
    </div>
  );
}

// ─── LoadingOverlay (frosted backdrop + centered card) ──────────
// Carte centrée bordée (spinner + message) sur fond flou. Deux usages :
//  • par défaut → `position: absolute; inset: 0` PAR-DESSUS du contenu existant
//    (refetch sur changement de date) ; le parent doit être en `position:
//    relative`.
//  • `fullPage` → retournée seule comme état de premier chargement d'une page
//    (s'auto-enveloppe dans un conteneur relatif `min-height: 60vh`).
// Apparaît après `delay` ms pour éviter un flash sur les réponses rapides.
export function LoadingOverlay({
  message,
  messages,
  delay = 250,
  fullPage = false,
}: {
  message?: string;
  messages?: string[];
  delay?: number;
  fullPage?: boolean;
}) {
  const [show, setShow] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  if (!show) return null;
  const overlay = (
    <div
      className="ms-overlay"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8,10,14,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        borderRadius: "inherit",
      }}
    >
      <div
        className="ms-overlay-card"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          padding: "26px 34px",
          background: "#121417",
          border: "1px solid var(--bd)",
          borderRadius: 14,
          boxShadow: "0 12px 32px rgba(0,0,0,0.50)",
          maxWidth: 320,
        }}
      >
        <Spinner inline messages={messages} message={message} size={32} />
      </div>
    </div>
  );
  if (fullPage) {
    return (
      <div style={{ position: "relative", width: "100%", minHeight: "60vh" }}>
        {overlay}
      </div>
    );
  }
  return overlay;
}

// ─── Avatar ─────────────────────────────────────────────────────
export function Avatar({ name = "You", size = 32, color = "var(--accent)" }: { name?: string; size?: number; color?: string }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 600, fontFamily: "DM Sans", flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ─── Placeholder (striped image stand-in) ───────────────────────
export function Placeholder({ label, w, height = 80, radius = 6 }: { label?: string; w?: number | string; height?: number; radius?: number }) {
  return (
    <div style={{ width: w || "100%", height, borderRadius: radius, background: "repeating-linear-gradient(45deg, #14171D, #14171D 6px, #181C23 6px, #181C23 12px)", border: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {label && <span style={{ fontSize: 9.5, fontFamily: "JetBrains Mono", color: "var(--tx-faint)", letterSpacing: ".04em" }}>{label}</span>}
    </div>
  );
}

// ─── SectionTitle (used across pages) ───────────────────────────
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <h3 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "var(--tx)", margin: 0 }}>{children}</h3>
      {right ? <div>{right}</div> : null}
    </div>
  );
}
