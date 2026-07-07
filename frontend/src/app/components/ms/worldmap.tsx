// MetaScope spend-by-country globe — an interactive 3D globe (cobe) replacing
// the former flat choropleth. Markers are placed at real country centroids
// (computed from the bundled world-atlas via d3 geoCentroid) and sized by REAL
// Meta spend; a ranked list beside it keeps every per-country metric reachable.
// No placeholder data: every marker/row comes from the `data` prop.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import createGlobe from "cobe";
import { geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import topo from "world-atlas/countries-110m.json";
import { ALPHA2_TO_NUM } from "../../lib/isoCountries";
import type { GeoDatum } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useResolvedTheme } from "../../providers/ThemeProvider";

interface CountryProps { name: string }
type CountryInfo = { name: string; centroid: [number, number] }; // centroid = [lng, lat]

// Build "numeric ISO id → { name, centroid }" once from the bundled atlas.
let COUNTRY_INFO: Record<string, CountryInfo> | null = null;
function countryInfo(): Record<string, CountryInfo> {
  if (COUNTRY_INFO) return COUNTRY_INFO;
  const map: Record<string, CountryInfo> = {};
  try {
    const t = topo as unknown as Topology;
    const geo = feature(t, t.objects.countries) as unknown as FeatureCollection<Geometry, CountryProps>;
    for (const f of geo.features) {
      if (f.id == null || f.properties.name === "Antarctica") continue;
      map[String(f.id)] = { name: f.properties.name, centroid: geoCentroid(f) as [number, number] };
    }
  } catch { /* fall through to empty map */ }
  COUNTRY_INFO = map;
  return map;
}

// Globe palette per theme (cobe 0–1 RGB). The globe is a WebGL canvas, so it
// can't read CSS vars — we switch config on the resolved theme. A dark globe on
// the light theme's white cards reads as a black ball, hence the light variant.
type GlobeCfg = {
  dark: number; mapBrightness: number; diffuse: number;
  baseColor: [number, number, number]; markerColor: [number, number, number]; glowColor: [number, number, number];
};
const GLOBE_DARK: GlobeCfg = {
  dark: 1, mapBrightness: 7, diffuse: 1.4,
  baseColor: [0.28, 0.34, 0.46], markerColor: [0.16, 0.55, 1.0], glowColor: [0.45, 0.55, 0.85],
};
const GLOBE_LIGHT: GlobeCfg = {
  dark: 0, mapBrightness: 6, diffuse: 1.2,
  baseColor: [0.92, 0.94, 0.98], markerColor: [0.09, 0.42, 0.92], glowColor: [0.86, 0.9, 0.98],
};

type Point = { code: string; name: string; location: [number, number]; size: number; d: GeoDatum };

// Replicate cobe's own marker projection so HTML name-labels land exactly on the
// dots (cobe: radius = ee 0.8 + markerElevation 0.05, scale 1, offset [0,0]).
const DEG = Math.PI / 180;
const GLOBE_R = 0.85;
function locToVec([lat, lng]: [number, number]): [number, number, number] {
  const r = lat * DEG, a = lng * DEG - Math.PI, o = Math.cos(r);
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}
/** Project a marker location to canvas CSS px + depth `z` (z>0 = front hemisphere). */
function projectMarker(loc: [number, number], phi: number, theta: number, size: number) {
  const v = locToVec(loc);
  const t0 = v[0] * GLOBE_R, t1 = v[1] * GLOBE_R, t2 = v[2] * GLOBE_R;
  const cr = Math.cos(theta), so = Math.sin(theta), ca = Math.cos(phi), si = Math.sin(phi);
  const c = ca * t0 + si * t2;
  const s = si * so * t0 + cr * t1 - ca * so * t2;
  const z = -si * cr * t0 + so * t1 + ca * cr * t2;
  return { x: ((c + 1) / 2) * size, y: ((-s + 1) / 2) * size, z };
}

export function WorldMap({ data = [], height = 360 }: { data?: GeoDatum[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiRef = useRef(0);
  const phiOffset = useRef(0);
  const thetaOffset = useRef(0);
  const pausedRef = useRef(false);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointsRef = useRef<Point[]>([]);
  const wakeRef = useRef<(() => void) | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const resolvedTheme = useResolvedTheme();
  const light = resolvedTheme === "light";

  // Reduce the globe to the countries we actually have spend for — real data only.
  const { points, maxSpend } = useMemo(() => {
    const info = countryInfo();
    let max = 0;
    const raw: { code: string; name: string; centroid: [number, number]; d: GeoDatum }[] = [];
    for (const d of data) {
      const num = ALPHA2_TO_NUM[(d.code || "").toUpperCase()];
      const ci = num ? info[num] : undefined;
      if (!ci) continue;
      if (d.spend > max) max = d.spend;
      raw.push({ code: d.code, name: ci.name, centroid: ci.centroid, d });
    }
    raw.sort((a, b) => b.d.spend - a.d.spend);
    const points: Point[] = raw.map((r) => {
      const t = max ? Math.pow(r.d.spend / max, 0.6) : 0;
      return { code: r.code, name: r.name, d: r.d, location: [r.centroid[1], r.centroid[0]], size: 0.02 + 0.05 * t };
    });
    return { points, maxSpend: max };
  }, [data]);
  pointsRef.current = points;

  // Stable signature of the marker set: unchanged (== "") when there are no
  // countries, so a fresh `[]` from the parent doesn't re-create the globe.
  const markerKey = useMemo(() => points.map((p) => p.code + ":" + p.size.toFixed(3)).join("|"), [points]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };
    pausedRef.current = true;
    wakeRef.current?.(); // restart the rAF loop if it idled (reduced motion)
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!pointerRef.current) return;
      dragOffset.current = {
        phi: (e.clientX - pointerRef.current.x) / 250,
        theta: (e.clientY - pointerRef.current.y) / 900,
      };
    };
    const onUp = () => {
      if (pointerRef.current) {
        phiOffset.current += dragOffset.current.phi;
        thetaOffset.current += dragOffset.current.theta;
        dragOffset.current = { phi: 0, theta: 0 };
      }
      pointerRef.current = null;
      pausedRef.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = reduce ? 0 : 0.005;
    canvas.style.opacity = "0";
    const cfg = light ? GLOBE_LIGHT : GLOBE_DARK;

    // cobe 2.x has no onRender callback — drive rotation via a rAF loop that
    // calls globe.update() each frame with the current phi/theta.
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: 0,
      theta: 0.3,
      dark: cfg.dark,
      diffuse: cfg.diffuse,
      mapSamples: 16000,
      mapBrightness: cfg.mapBrightness,
      baseColor: cfg.baseColor,
      markerColor: cfg.markerColor,
      glowColor: cfg.glowColor,
      opacity: 1,
      markers: pointsRef.current.map((p) => ({ location: p.location, size: p.size })),
    });

    let raf = 0;
    const render = () => {
      if (!pausedRef.current) phiRef.current += speed;
      const phi = phiRef.current + phiOffset.current + dragOffset.current.phi;
      // Clamp vertical tilt so the globe can't be dragged upside-down.
      const theta = Math.max(-0.9, Math.min(0.9, 0.3 + thetaOffset.current + dragOffset.current.theta));
      globe.update({ phi, theta });
      // Move each country-name label onto its dot; fade/hide it on the back face.
      const pts = pointsRef.current;
      for (let i = 0; i < pts.length; i++) {
        const el = labelRefs.current[i];
        if (!el) continue;
        const pr = projectMarker(pts[i].location, phi, theta, size);
        if (pr.z > 0.02) {
          el.style.opacity = String(Math.min(1, pr.z / 0.3));
          el.style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -145%)`;
          el.style.zIndex = String(1000 + Math.round(pr.z * 100));
        } else {
          el.style.opacity = "0";
        }
      }
      // Keep animating while auto-rotating or dragging; otherwise idle (reduced
      // motion) — the loop is woken again on pointer-down.
      raf = speed > 0 || pointerRef.current ? requestAnimationFrame(render) : 0;
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(render); };
    wakeRef.current = start;
    start();
    const t = setTimeout(() => { if (canvasRef.current) canvasRef.current.style.opacity = "1"; }, 0);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); wakeRef.current = null; globe.destroy(); };
  }, [markerKey, height, light]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
      {/* Globe */}
      <div style={{ position: "relative", width: height, height, flexShrink: 0, margin: "0 auto" }}>
        <div style={{ position: "absolute", inset: "8%", borderRadius: "50%", background: "radial-gradient(circle at 50% 45%, rgba(24,119,242,.22), transparent 62%)", filter: "blur(14px)", pointerEvents: "none" }} />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          style={{ position: "relative", width: height, height, cursor: "grab", opacity: 0, transition: "opacity 1s ease", touchAction: "none", contain: "layout paint size" }}
        />
        {/* Country-name labels — positioned on their dots each frame by the rAF loop. */}
        {points.map((p, i) => (
          <div
            key={p.code}
            ref={(el) => { labelRefs.current[i] = el; }}
            style={{
              position: "absolute", top: 0, left: 0, opacity: 0, willChange: "transform, opacity",
              pointerEvents: "none", whiteSpace: "nowrap", fontFamily: "JetBrains Mono", fontSize: 10,
              fontWeight: 600, letterSpacing: ".02em", color: "var(--tx)", background: "color-mix(in srgb, var(--surf-pop) 82%, transparent)",
              border: "1px solid var(--bd)", borderRadius: 4, padding: "1px 5px", lineHeight: 1.5,
              boxShadow: "0 2px 8px rgba(0,0,0,.35)",
            }}
          >
            {p.name}
          </div>
        ))}
      </div>

      {/* Real-data ranked list — preserves the per-country metrics the old tooltip showed */}
      <div style={{ flex: "1 1 220px", minWidth: 200, maxHeight: height, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {points.length === 0 ? (
          <div style={{ color: "var(--tx-dim)", fontSize: 13, padding: "10px 2px" }}>Aucune dépense géolocalisée sur la période.</div>
        ) : points.map((r, i) => {
          const open = expanded === r.code;
          const frac = maxSpend ? r.d.spend / maxSpend : 0;
          return (
            <button
              key={r.code}
              onClick={() => setExpanded(open ? null : r.code)}
              style={{ appearance: "none", textAlign: "left", background: open ? "var(--surf-3)" : "transparent", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", transition: "background 140ms" }}
              onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "var(--surf-2)"; }}
              onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flexShrink: 0, width: 16, fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600, color: "var(--tx-dim)" }}>{(i + 1).toString().padStart(2, "0")}</span>
                <span style={{ flex: 1, minWidth: 0, color: "var(--tx)", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ flexShrink: 0, fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-2)" }}>{fmtMoney(r.d.spend)}</span>
              </div>
              <div style={{ marginLeft: 26, marginTop: 5, height: 4, borderRadius: 2, background: "var(--bd)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(3, frac * 100)}%`, height: "100%", borderRadius: 2, background: "linear-gradient(90deg, #2E7CE6, #1877F2)" }} />
              </div>
              {open && (
                <div style={{ marginLeft: 26, marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 11 }}>
                  {([["Impr.", fmtNum(r.d.impressions)], ["Clics", fmtNum(r.d.clicks)], ["CTR", r.d.ctr.toFixed(2) + "%"]] as Array<[string, string]>).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ color: "var(--tx-dim)" }}>{k}</span>
                      <span style={{ color: "var(--tx-2)", fontFamily: "JetBrains Mono", fontSize: 11.5 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}

        {points.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--bd-weak)", color: "var(--tx-dim)", fontSize: 11 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1877F2" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1877F2" }} />
            <span>Taille du point ∝ dépense · glisser pour tourner</span>
          </div>
        )}
      </div>
    </div>
  );
}
