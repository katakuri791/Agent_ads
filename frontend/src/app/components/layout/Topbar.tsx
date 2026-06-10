import { Bell } from "lucide-react";
import { AuthUser, displayName } from "../../lib/auth";
import { Avatar } from "../ms/primitives";
import { AccountFilter } from "../filters/AccountFilter";
import { DateRangeFilter } from "../filters/DateRangeFilter";
import { SyncIndicator } from "../shared/SyncIndicator";
import { TITLES } from "./Sidebar";

/** Barre supérieure : titre + les deux filtres globaux (compte Meta + plage de
 *  dates façon Meta Ads) + notifications + avatar. Le filtre date n'apparaît que
 *  sur les vues où il a un effet (Overview, Campagnes). */
export function Topbar({ page, user, onGoToSettings }: { page: string; user: AuthUser; onGoToSettings: () => void }) {
  const showDateFilter = page === "overview" || page === "campaigns";
  return (
    <header style={{ height: 56, flexShrink: 0, borderBottom: "1px solid #1E2128", background: "rgba(10,12,16,.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", zIndex: 30 }}>
      <h1 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "#F9FAFB", margin: 0, letterSpacing: "-.01em" }}>{TITLES[page]}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showDateFilter && <DateRangeFilter />}
        <SyncIndicator />
        <AccountFilter onGoToSettings={onGoToSettings} />
        <button className="ms-icon-btn" style={{ position: "relative", width: 36, height: 36, borderRadius: 8, background: "transparent", border: "1px solid #1E2128", color: "#9AA1AC", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Bell size={18} />
          <span style={{ position: "absolute", top: 8, right: 9, width: 6, height: 6, borderRadius: 999, background: "#EF4444", border: "1.5px solid #0A0C10" }} />
        </button>
        <Avatar name={displayName(user)} size={32} />
      </div>
    </header>
  );
}
