import { AuthUser, displayName } from "../../lib/auth";
import { Avatar, ThemeToggle } from "../ms/primitives";
import { NotificationBell } from "../NotificationBell";
import { AccountFilter } from "../filters/AccountFilter";
import { DateRangeFilter } from "../filters/DateRangeFilter";
import { SyncIndicator } from "../shared/SyncIndicator";
import { useTheme, useResolvedTheme } from "../../providers/ThemeProvider";
import { TITLES } from "./Sidebar";

/** Barre supérieure : titre + les deux filtres globaux (compte Meta + plage de
 *  dates façon Meta Ads) + notifications + avatar. Le filtre date n'apparaît que
 *  sur les vues où il a un effet (Overview, Campagnes). */
export function Topbar({ page, user, onGoToSettings }: { page: string; user: AuthUser; onGoToSettings: () => void }) {
  const showDateFilter = page === "overview" || page === "campaigns";
  const { toggleTheme } = useTheme();
  const resolved = useResolvedTheme();
  return (
    <header style={{ height: 56, flexShrink: 0, borderBottom: "1px solid var(--bd)", background: "color-mix(in srgb, var(--surf-1) 88%, transparent)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", zIndex: 30 }}>
      <h1 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "var(--tx)", margin: 0, letterSpacing: "-.01em" }}>{TITLES[page]}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showDateFilter && <DateRangeFilter />}
        <SyncIndicator />
        <ThemeToggle dark={resolved !== "light"} onToggle={toggleTheme} />
        <AccountFilter onGoToSettings={onGoToSettings} />
        <NotificationBell onGoToSettings={onGoToSettings} />
        <Avatar name={displayName(user)} size={32} />
      </div>
    </header>
  );
}
