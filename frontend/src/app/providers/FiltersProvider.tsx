import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { DateRange } from "../lib/api";

interface FiltersCtxValue {
  /** Plage de dates globale (façon Meta Ads) partagée par Overview + Campagnes. */
  range: DateRange;
  rangeLabel: string;
  setRange: (range: DateRange, label: string) => void;
}

const DEFAULT_RANGE: DateRange = { preset: "last_30d" };
const DEFAULT_LABEL = "30 derniers jours";

const FiltersCtx = createContext<FiltersCtxValue>({
  range: DEFAULT_RANGE,
  rangeLabel: DEFAULT_LABEL,
  setRange: () => {},
});

export const useFilters = () => useContext(FiltersCtx);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<DateRange>(DEFAULT_RANGE);
  const [rangeLabel, setRangeLabel] = useState(DEFAULT_LABEL);
  const setRange = useCallback((r: DateRange, label: string) => {
    setRangeState(r);
    setRangeLabel(label);
  }, []);
  return (
    <FiltersCtx.Provider value={{ range, rangeLabel, setRange }}>
      {children}
    </FiltersCtx.Provider>
  );
}
