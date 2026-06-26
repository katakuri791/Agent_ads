// MetaScope — système de motion (ports de motion.jsx + blob.jsx du prototype).
// Courbes spring, count-up de chiffres, entrée FadeIn, et « blobs » décoratifs.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

// ─── Courbes d'easing ───────────────────────────────────────────
export const EASE = {
  spring: "cubic-bezier(.34,1.56,.64,1)",      // overshoot / bounce
  springSoft: "cubic-bezier(.34,1.32,.5,1)",   // overshoot doux
  smooth: "cubic-bezier(.22,1,.36,1)",         // expo-out, très lisse
  snappy: "cubic-bezier(.4,0,.2,1)",
};

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── Count-up : anime un chiffre de 0 → cible en gardant préfixe/suffixe ──
interface Parsed { prefix: string; num: number; decimals: number; suffix: string; }
function parseVal(v: string): Parsed | null {
  const m = v.match(/^([^\d-]*)(-?\d[\d,]*\.?\d*)(.*)$/);
  if (!m) return null;
  const numStr = m[2].replace(/,/g, "");
  const num = parseFloat(numStr);
  if (!isFinite(num)) return null;
  const dot = numStr.indexOf(".");
  const decimals = dot === -1 ? 0 : numStr.length - dot - 1;
  return { prefix: m[1], num, decimals, suffix: m[3] };
}
function fmtVal(n: number, p: Parsed): string {
  const fixed = Math.abs(n) < 1e-9 ? (0).toFixed(p.decimals) : n.toFixed(p.decimals);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return p.prefix + parts.join(".") + p.suffix;
}

// Utilise setInterval + horloge murale (pas rAF) pour atteindre la valeur finale
// même quand l'onglet est en arrière-plan.
export function useCountUp(value: string, opts: { duration?: number; delay?: number } = {}): string {
  const { duration = 1150, delay = 0 } = opts;
  const parsed = useMemo(() => parseVal(value), [value]);
  const [disp, setDisp] = useState<string>(() => (parsed ? fmtVal(0, parsed) : value));
  useEffect(() => {
    if (!parsed) { setDisp(value); return; }
    if (prefersReduced()) { setDisp(value); return; }
    const to = parsed.num;
    let start: number | null = null;
    let iv: ReturnType<typeof setInterval>;
    const tick = () => {
      const now = performance.now();
      if (start == null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      if (t >= 1) { clearInterval(iv); setDisp(value); }
      else setDisp(fmtVal(to * e, parsed));
    };
    const tid = setTimeout(() => { tick(); iv = setInterval(tick, 32); }, delay);
    return () => { clearTimeout(tid); clearInterval(iv); };
  }, [parsed, value, duration, delay]);
  return disp;
}

// ─── FadeIn : entrée JS-driven (sûre en arrière-plan) ───────────
export function FadeIn({ children, y = 10, x = 0, scale, delay = 0, dur = 520, ease = EASE.smooth, style }: {
  children?: ReactNode; y?: number; x?: number; scale?: number; delay?: number; dur?: number; ease?: string; style?: CSSProperties;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delay + 20); return () => clearTimeout(t); }, [delay]);
  const hidden = `translate(${x}px, ${y}px)` + (scale ? ` scale(${scale})` : "");
  return (
    <div style={{ opacity: on ? 1 : 0, transform: on ? "none" : hidden, transition: `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`, willChange: "opacity, transform", ...style }}>
      {children}
    </div>
  );
}

// ─── Blob : glyphe décoratif d'angle de carte ───────────────────
const GLYPHS = ["heart", "star", "sparkle", "blob", "wave", "donut"] as const;
type Glyph = typeof GLYPHS[number];
function path(kind: Glyph): string {
  switch (kind) {
    case "heart": return "M44 14c-3 0-5 2-6 4-1-2-3-4-6-4-5 0-9 4-9 9 0 8 11 14 15 17 4-3 15-9 15-17 0-5-4-9-9-9z";
    case "star": return "M38 4l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z";
    case "sparkle": return "M38 4l3.5 10 10 3.5-10 3.5-3.5 10-3.5-10-10-3.5 10-3.5z M58 22l1.6 4.4 4.4 1.6-4.4 1.6L58 34l-1.6-4.4L52 28l4.4-1.6z";
    case "blob": return "M48 6c10 0 18 7 18 16s-5 14-10 18-12 8-22 4-14-12-14-20 18-18 28-18z";
    case "wave": return "M4 28 Q14 16 24 28 T44 28 T64 28";
    case "donut": return "M38 8a18 18 0 1 0 .01 0zM38 22a4 4 0 1 1 0 8 4 4 0 0 1 0-8z";
    default: return "";
  }
}
export function Blob({ kind = "heart", color = "#1877F2", opacity = 0.18, size = 70, top = -10, right = -10, left, bottom, rotate = -12 }: {
  kind?: Glyph; color?: string; opacity?: number; size?: number; top?: number; right?: number; left?: number; bottom?: number; rotate?: number;
}) {
  const g: Glyph = (GLYPHS as readonly string[]).includes(kind) ? kind : "heart";
  const isStroke = g === "wave";
  return (
    <svg viewBox="0 0 70 50" width={size} height={size * 0.72} aria-hidden className="ms-blob"
      style={{ position: "absolute", top, right, left, bottom, transform: `rotate(${rotate}deg)`, pointerEvents: "none", opacity, color, transition: "transform .5s cubic-bezier(.34,1.56,.64,1), opacity .3s" }}>
      <path d={path(g)} fill={isStroke ? "none" : "currentColor"} stroke={isStroke ? "currentColor" : "none"} strokeWidth={isStroke ? 4 : 0} strokeLinecap="round" />
    </svg>
  );
}

// Sélection déterministe d'un glyphe + couleur par index (chaque KPI a sa déco).
export function blobFor(idx: number): { kind: Glyph; color: string } {
  const colors = ["#1877F2", "#22C55E", "#F59E0B", "#A855F7", "#EC4899", "#06B6D4", "#F97316", "#84CC16"];
  return { kind: GLYPHS[idx % GLYPHS.length], color: colors[idx % colors.length] };
}
