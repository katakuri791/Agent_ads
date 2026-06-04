// MetaScope choropleth world map — d3-geo + topojson + world-atlas, bundled
// (no CDN fetch). Colors countries light→deep blue by spend intensity with a
// hover tooltip and legend. Ported from the prototype's worldmap.jsx.
import { useState, useEffect, useRef, useMemo } from "react";
import { geoPath, geoNaturalEarth1 } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import topo from "world-atlas/countries-110m.json";
import { ALPHA2_TO_NUM } from "../../lib/isoCountries";
import type { GeoDatum } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";

function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function colorFor(spend: number | null, max: number): string {
  if (spend == null) return "#171A21";
  const t = Math.pow(Math.min(1, spend / (max || 1)), 0.6);
  // light #BFD9FF -> deep #0A57C2
  const r = lerp(0xBF, 0x0A, t), g = lerp(0xD9, 0x57, t), b = lerp(0xFF, 0xC2, t);
  return `rgb(${r},${g},${b})`;
}

interface CountryProps { name: string; }
type Tip = { name: string; data?: GeoDatum; x: number; y: number };

export function WorldMap({ data = [], height = 360 }: { data?: GeoDatum[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [tip, setTip] = useState<Tip | null>(null);

  // Index real spend-by-country data by the numeric ISO id used by world-atlas.
  const { byId, maxSpend } = useMemo(() => {
    const map: Record<string, GeoDatum> = {};
    let max = 0;
    for (const d of data) {
      const num = ALPHA2_TO_NUM[(d.code || "").toUpperCase()];
      if (!num) continue;
      map[num] = d;
      if (d.spend > max) max = d.spend;
    }
    return { byId: map, maxSpend: max };
  }, [data]);

  useEffect(() => {
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const features = useMemo(() => {
    try {
      const t = topo as unknown as Topology;
      const geo = feature(t, t.objects.countries) as unknown as FeatureCollection<Geometry, CountryProps>;
      return geo.features.filter((f) => f.properties.name !== "Antarctica");
    } catch {
      return null;
    }
  }, []);

  const paths = useMemo(() => {
    if (!features) return null;
    const projection = geoNaturalEarth1();
    projection.fitSize([w, height], { type: "FeatureCollection", features } as FeatureCollection);
    const path = geoPath(projection);
    return features.map((f: Feature<Geometry, CountryProps>, i: number) => {
      const data = f.id != null ? byId[String(f.id)] : undefined;
      return { d: path(f) || "", name: f.properties.name, data, color: colorFor(data ? data.spend : null, maxSpend), i };
    });
  }, [features, w, height, byId, maxSpend]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      {!paths && <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 13 }}>Map unavailable</div>}
      {paths && (
        <svg width="100%" height={height} style={{ display: "block" }}>
          {paths.map((p) => (
            <path key={p.i} d={p.d} fill={p.color} stroke="#0A0C10" strokeWidth={0.5}
              style={{ transition: "fill 200ms, filter 150ms", cursor: p.data ? "pointer" : "default", filter: tip && tip.name === p.name ? "brightness(1.25)" : "none" }}
              onMouseMove={(e) => {
                const r = wrapRef.current!.getBoundingClientRect();
                setTip({ name: p.name, data: p.data, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setTip(null)} />
          ))}
        </svg>
      )}
      {tip && (
        <div style={{ position: "absolute", left: Math.min(w - 190, tip.x + 14), top: Math.max(0, tip.y - 10), width: 176, background: "#16181F", border: "1px solid #1E2128", borderRadius: 8, padding: "9px 11px", pointerEvents: "none", boxShadow: "0 12px 34px rgba(0,0,0,.55)", zIndex: 5 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: "#F9FAFB", marginBottom: tip.data ? 6 : 0 }}>{tip.name}</div>
          {tip.data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5 }}>
              {([["Spend", fmtMoney(tip.data.spend)], ["Impr.", fmtNum(tip.data.impressions)], ["Clicks", fmtNum(tip.data.clicks)], ["CTR", tip.data.ctr.toFixed(2) + "%"]] as Array<[string, string]>).map((row, k) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6B7280" }}>{row[0]}</span>
                  <span style={{ color: "#D1D5DB", fontFamily: "JetBrains Mono" }}>{row[1]}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#6B7280" }}>No active campaigns</div>
          )}
        </div>
      )}
      {paths && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>Low</span>
          <div style={{ flex: 1, maxWidth: 240, height: 8, borderRadius: 4, background: "linear-gradient(90deg, #BFD9FF, #2E7CE6, #0A57C2)" }} />
          <span style={{ fontSize: 11, color: "#6B7280" }}>High spend</span>
        </div>
      )}
    </div>
  );
}
