// MetaScope bespoke SVG charts (ported from the prototype's charts.jsx).
// Self-contained, animated, dependency-free — kept faithful to the design.
import { useState, useEffect, useRef } from "react";
import { fmtMoney, fmtNum } from "../../lib/format";

// Age × gender datum used by GroupedBar (real data from campaign/account insights).
export interface AgeGender {
  age: string;
  male: number;
  female: number;
}

// ─── Sparkline ──────────────────────────────────────────────────
export function Sparkline({ data, color = "var(--accent)", height = 40, fill = true }: {
  data: number[]; color?: string; height?: number; fill?: boolean;
}) {
  const w = 200, pad = 2;
  if (!data || data.length === 0) return <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} />;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [
    pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2),
    height - pad - ((v - min) / rng) * (height - pad * 2),
  ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${w - pad} ${height} L${pad} ${height} Z`;
  const id = "spk" + color.replace("#", "") + Math.round(height);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      {fill && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── LineChart (dual axis) ──────────────────────────────────────
export interface LinePoint { date: Date; spend: number; impressions: number; }
export function LineChart({ series, height = 300 }: { series: LinePoint[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setDrawn(false); const t = setTimeout(() => setDrawn(true), 30); return () => clearTimeout(t); }, [series]);

  if (!series || series.length === 0) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-dim)", fontSize: 13 }}>No data for this period.</div>;
  }

  const padL = 52, padR = 52, padT = 16, padB = 28;
  const iw = Math.max(10, w - padL - padR), ih = height - padT - padB;
  const spend = series.map((s) => s.spend), impr = series.map((s) => s.impressions);
  const sMax = Math.max(...spend) * 1.1 || 1, iMax = Math.max(...impr) * 1.1 || 1;
  const x = (i: number) => padL + (i / Math.max(1, series.length - 1)) * iw;
  const ys = (v: number) => padT + ih - (v / sMax) * ih;
  const yi = (v: number) => padT + ih - (v / iMax) * ih;
  const lineFrom = (vals: number[], yf: (v: number) => number) =>
    vals.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + yf(v).toFixed(1)).join(" ");
  const spendPath = lineFrom(spend, ys), imprPath = lineFrom(impr, yi);
  const baseY = padT + ih;
  const areaFrom = (path: string) => `${path} L${x(series.length - 1).toFixed(1)} ${baseY} L${x(0).toFixed(1)} ${baseY} Z`;
  const spendArea = areaFrom(spendPath), imprArea = areaFrom(imprPath);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  function move(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let idx = Math.round(((px - padL) / iw) * (series.length - 1));
    idx = Math.max(0, Math.min(series.length - 1, idx));
    setHover(idx);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} onMouseMove={move} onMouseLeave={() => setHover(null)} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="lcSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.20} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="lcImpr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <g>{grid.map((g, i) => <line key={i} x1={padL} x2={w - padR} y1={padT + ih * g} y2={padT + ih * g} stroke="var(--bd)" strokeWidth={1} />)}</g>
        <path d={imprArea} fill="url(#lcImpr)" style={{ opacity: drawn ? 1 : 0, transition: "opacity 800ms ease 200ms" }} />
        <path d={spendArea} fill="url(#lcSpend)" style={{ opacity: drawn ? 1 : 0, transition: "opacity 800ms ease 280ms" }} />
        <g>{grid.map((g, i) => <text key={i} x={padL - 10} y={padT + ih * g + 4} textAnchor="end" fontSize={10} fill="var(--tx-dim)" fontFamily="JetBrains Mono, monospace">{fmtMoney(sMax * (1 - g))}</text>)}</g>
        <g>{grid.map((g, i) => <text key={i} x={w - padR + 10} y={padT + ih * g + 4} textAnchor="start" fontSize={10} fill="var(--tx-dim)" fontFamily="JetBrains Mono, monospace">{fmtNum(iMax * (1 - g))}</text>)}</g>
        <path d={imprPath} fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={4000} strokeDashoffset={drawn ? 0 : 4000} style={{ transition: "stroke-dashoffset 700ms ease" }} />
        <path d={spendPath} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={4000} strokeDashoffset={drawn ? 0 : 4000} style={{ transition: "stroke-dashoffset 700ms ease 80ms" }} />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#3A3F4B" strokeWidth={1} />}
        {hover != null && <circle cx={x(hover)} cy={ys(spend[hover])} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />}
        {hover != null && <circle cx={x(hover)} cy={yi(impr[hover])} r={4} fill="#22C55E" stroke="var(--bg)" strokeWidth={2} />}
        <g>{[0, Math.floor(series.length / 2), series.length - 1].map((i, k) => (
          <text key={k} x={x(i)} y={height - 8} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize={10} fill="var(--tx-dim)">{fmtDate(series[i].date)}</text>
        ))}</g>
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", left: Math.min(w - 170, Math.max(0, x(hover) - 80)), top: 4, width: 160, background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 8, padding: "8px 10px", pointerEvents: "none", boxShadow: "0 10px 30px rgba(0,0,0,.5)", fontSize: 12 }}>
          <div style={{ color: "var(--tx-dim)", fontSize: 11, marginBottom: 4 }}>{fmtDate(series[hover].date)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--tx-2)" }}><span>● Spend</span><span style={{ fontFamily: "JetBrains Mono", color: "var(--accent)" }}>{fmtMoney(spend[hover])}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--tx-2)" }}><span>● Impr.</span><span style={{ fontFamily: "JetBrains Mono", color: "#22C55E" }}>{fmtNum(impr[hover])}</span></div>
        </div>
      )}
    </div>
  );
}

// ─── DonutChart ─────────────────────────────────────────────────
export interface DonutDatum { label: string; value: number; color: string; }
export function DonutChart({ data, size = 200, thickness = 26 }: { data: DonutDatum[]; size?: number; thickness?: number }) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const segs = data.map((d) => {
    const frac = d.value / total;
    const seg = { ...d, frac, offset: acc };
    acc += frac;
    return seg;
  });
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {segs.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
            strokeWidth={active === i ? thickness + 6 : thickness}
            strokeDasharray={`${(mounted ? s.frac : 0) * circ} ${circ}`}
            strokeDashoffset={-s.offset * circ}
            style={{ transition: "stroke-dasharray 800ms cubic-bezier(.4,0,.2,1), stroke-width 150ms" }}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 24, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", color: "var(--tx)" }}>{active != null ? Math.round(segs[active].frac * 100) + "%" : fmtNum(total)}</div>
        <div style={{ fontSize: 11, color: "var(--tx-dim)", letterSpacing: ".04em", marginTop: 2 }}>{active != null ? segs[active].label : "TOTAL"}</div>
      </div>
    </div>
  );
}

// ─── BarChart (vertical) ────────────────────────────────────────
export function BarChart({ data, height = 180, color = "var(--accent)" }: { data: Array<{ name: string; value: number }>; height?: number; color?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--tx-2)", marginBottom: 6 }}>{d.value}%</div>
          <div style={{ width: "100%", maxWidth: 44, borderRadius: "4px 4px 0 0", background: color, height: mounted ? (d.value / max) * (height - 56) : 0, transition: `height 600ms cubic-bezier(.4,0,.2,1) ${i * 50}ms` }} />
          <div style={{ fontSize: 10, color: "var(--tx-dim)", marginTop: 8, textAlign: "center", lineHeight: 1.2 }}>{d.name}</div>
        </div>
      ))}
    </div>
  );
}

// ─── GroupedBar (age/gender, horizontal) ────────────────────────
export function GroupedBar({ data, maleColor = "var(--accent)", femaleColor = "#EC4899" }: { data: AgeGender[]; maleColor?: string; femaleColor?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);
  const max = Math.max(...data.flatMap((d) => [d.male, d.female])) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--tx-dim)", marginBottom: 2 }}>
        <span><span style={{ color: maleColor }}>● </span>Male</span>
        <span><span style={{ color: femaleColor }}>● </span>Female</span>
      </div>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 44, fontSize: 11, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>{d.age}</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 9, borderRadius: 3, background: maleColor, width: (mounted ? (d.male / max) * 100 : 0) + "%", transition: `width 600ms ease ${i * 40}ms` }} />
            <div style={{ height: 9, borderRadius: 3, background: femaleColor, width: (mounted ? (d.female / max) * 100 : 0) + "%", transition: `width 600ms ease ${i * 40 + 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── StackedBar (organic vs paid per day) ───────────────────────
export function StackedBar({ data, height = 220 }: { data: Array<{ organic: number; paid: number }>; height?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);
  const max = Math.max(...data.map((d) => d.organic + d.paid)) || 1;
  return (
    <div>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--tx-dim)", marginBottom: 12 }}>
        <span><span style={{ color: "var(--accent)" }}>● </span>Paid reach</span>
        <span><span style={{ color: "#22C55E" }}>● </span>Organic reach</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => {
          const total = d.organic + d.paid || 1;
          const th = mounted ? (total / max) * height : 0;
          return (
            <div key={i} title={`Paid ${fmtNum(d.paid)} · Organic ${fmtNum(d.organic)}`} style={{ flex: 1, height: th, display: "flex", flexDirection: "column", borderRadius: "3px 3px 0 0", overflow: "hidden", transition: `height 600ms ease ${i * 12}ms`, cursor: "pointer" }}>
              <div style={{ height: (d.paid / total) * 100 + "%", background: "var(--accent)" }} />
              <div style={{ height: (d.organic / total) * 100 + "%", background: "#22C55E" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FollowersChart (area, single series) ───────────────────────
export function FollowersChart({ data, height = 220 }: { data: number[]; height?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);
  if (!data || data.length === 0) return <div style={{ height }} />;
  const w = 100, min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, 100 - ((v - min) / rng) * 92 - 4]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");
  const area = line + ` L100 100 L0 100 Z`;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox="0 0 100 100" width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="fgrow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#fgrow)" style={{ opacity: mounted ? 1 : 0, transition: "opacity .8s" }} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={400} strokeDashoffset={mounted ? 0 : 400} style={{ transition: "stroke-dashoffset 900ms ease" }} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>
        <span>{fmtNum(data[0])}</span>
        <span style={{ color: "#22C55E" }}>+{fmtNum(data[data.length - 1] - data[0])}</span>
        <span>{fmtNum(data[data.length - 1])}</span>
      </div>
    </div>
  );
}
