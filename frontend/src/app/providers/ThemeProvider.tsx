import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** Thème de l'app : Dark (défaut), Light (nouveau design clair), Dim (fonds
 *  relevés), ou System (suit l'OS). Le toggle de la topbar bascule Dark ↔ Light ;
 *  Settings expose les quatre. */
export type ThemeMode = "dark" | "light" | "dim" | "system";

const THEME_KEY = "ui_theme";
const ACCENT_KEY = "ui_accent";
const DEFAULT_ACCENT = "#1877F2";

interface ThemeCtx {
  theme: ThemeMode;
  accent: string;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  setAccent: (c: string) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

function resolveClass(theme: ThemeMode): "dark" | "light" | "dim" {
  if (theme === "system") {
    const light = typeof window !== "undefined"
      && window.matchMedia("(prefers-color-scheme: light)").matches;
    return light ? "light" : "dark";
  }
  return theme;
}

function applyTheme(theme: ThemeMode, accent: string) {
  const el = document.documentElement;
  el.classList.remove("dark", "light", "dim");
  el.classList.add(resolveClass(theme));
  el.style.setProperty("--accent", accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || "dark",
  );
  const [accent, setAccentState] = useState<string>(
    () => localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT,
  );

  useEffect(() => { applyTheme(theme, accent); }, [theme, accent]);

  // En mode "system", refléter les changements de préférence de l'OS en direct.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system", accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, accent]);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);

  // Bascule rapide Dark ↔ Light (utilisée par le bouton lune/soleil de la topbar).
  // Ajoute une classe de cross-fade le temps de la transition.
  const toggleTheme = useCallback(() => {
    const el = document.documentElement;
    el.classList.add("ms-theming");
    setThemeState((t) => {
      const next: ThemeMode = resolveClass(t) === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
    setTimeout(() => el.classList.remove("ms-theming"), 450);
  }, []);

  const setAccent = useCallback((c: string) => {
    setAccentState(c);
    localStorage.setItem(ACCENT_KEY, c);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, toggleTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Le thème effectivement appliqué (résout "system"). Pratique pour les icônes. */
export function useResolvedTheme(): "dark" | "light" | "dim" {
  const { theme } = useTheme();
  return resolveClass(theme);
}
