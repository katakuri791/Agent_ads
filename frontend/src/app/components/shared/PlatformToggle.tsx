import { Facebook, Instagram, Layers } from "lucide-react";
import { useFilters, type PlatformFilter } from "../../providers/FiltersProvider";

/** Toggle Facebook / Instagram partagé (Overview + Campagnes). "all" = toutes
 *  plateformes. Le choix est persisté et pilote les requêtes dashboard/campaigns. */
const OPTIONS: Array<{ value: PlatformFilter; label: string; icon: typeof Layers; color: string }> = [
  { value: "all", label: "Toutes", icon: Layers, color: "var(--accent)" },
  { value: "facebook", label: "Facebook", icon: Facebook, color: "#1877F2" },
  { value: "instagram", label: "Instagram", icon: Instagram, color: "#E1306C" },
];

export function PlatformToggle() {
  const { platform, setPlatform } = useFilters();
  return (
    <div
      role="group"
      aria-label="Filtre plateforme"
      style={{
        display: "inline-flex", alignItems: "center", gap: 2, padding: 3,
        background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 10,
      }}
    >
      {OPTIONS.map((o) => {
        const active = platform === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => setPlatform(o.value)}
            title={o.label}
            aria-pressed={active}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "IBM Plex Sans", fontSize: 12.5, fontWeight: 500,
              background: active ? "var(--surf-card)" : "transparent",
              color: active ? "var(--tx)" : "var(--tx-dim)",
              boxShadow: active ? "inset 0 0 0 1px var(--bd)" : "none",
              transition: "color .15s, background .15s",
            }}
          >
            <Icon size={14} color={active ? o.color : "currentColor"} />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
