import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { DateRange } from "../lib/api";

/** Filtre plateforme (toggle Facebook/Instagram). "all" = toutes plateformes. */
export type PlatformFilter = "all" | "facebook" | "instagram";

interface FiltersCtxValue {
  /** Plage de dates globale (façon Meta Ads) partagée par Overview + Campagnes. */
  range: DateRange;
  rangeLabel: string;
  setRange: (range: DateRange, label: string) => void;
  /** Plateforme sélectionnée, partagée par Overview + Campagnes. */
  platform: PlatformFilter;
  setPlatform: (p: PlatformFilter) => void;
}

const DEFAULT_RANGE: DateRange = { preset: "last_30d" };
const DEFAULT_LABEL = "30 derniers jours";
const PLATFORM_KEY = "ui_platform";

function loadPlatform(): PlatformFilter {
  try {
    const v = localStorage.getItem(PLATFORM_KEY);
    if (v === "facebook" || v === "instagram" || v === "all") return v;
  } catch { /* ignore */ }
  return "all";
}

const FiltersCtx = createContext<FiltersCtxValue>({
  range: DEFAULT_RANGE,
  rangeLabel: DEFAULT_LABEL,
  setRange: () => {},
  platform: "all",
  setPlatform: () => {},
});

export const useFilters = () => useContext(FiltersCtx);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<DateRange>(DEFAULT_RANGE);
  const [rangeLabel, setRangeLabel] = useState(DEFAULT_LABEL);
  const [platform, setPlatformState] = useState<PlatformFilter>(loadPlatform);
  const setRange = useCallback((r: DateRange, label: string) => {
    setRangeState(r);
    setRangeLabel(label);
  }, []);
  const setPlatform = useCallback((p: PlatformFilter) => setPlatformState(p), []);
  useEffect(() => {
    try { localStorage.setItem(PLATFORM_KEY, platform); } catch { /* ignore */ }
  }, [platform]);
  return (
    <FiltersCtx.Provider value={{ range, rangeLabel, setRange, platform, setPlatform }}>
      {children}
    </FiltersCtx.Provider>
  );
}
