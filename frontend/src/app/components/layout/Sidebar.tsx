import {
  LayoutDashboard, BarChart3, Facebook, Users, CalendarClock, Sparkles, Settings as SettingsIcon, ChevronLeft,
} from "lucide-react";

export const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaign Analysis", icon: BarChart3 },
  { id: "page", label: "Facebook Page", icon: Facebook },
  { id: "audiences", label: "Audience Insights", icon: Users },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "ai", label: "AI Agent", icon: Sparkles },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export const TITLES: Record<string, string> = {
  overview: "Overview", campaigns: "Campaign Analysis", page: "Facebook Page",
  audiences: "Audience Insights", schedule: "Schedule", ai: "AI Agent", settings: "Settings",
};

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: collapsed ? 0 : "0 20px", justifyContent: collapsed ? "center" : "flex-start", borderBottom: "1px solid var(--bd)", flexShrink: 0 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,var(--accent),#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: 999, border: "2.5px solid #fff" }} />
      </div>
      {!collapsed && <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "var(--tx)", letterSpacing: "-.01em" }}>MetaScope</span>}
    </div>
  );
}

export function Sidebar({ page, navigate, collapsed, setCollapsed }: {
  page: string; navigate: (id: string) => void; collapsed: boolean; setCollapsed: (fn: (c: boolean) => boolean) => void;
}) {
  return (
    <aside style={{ width: collapsed ? 64 : 240, flexShrink: 0, background: "var(--surf-1)", borderRight: "1px solid var(--bd)", display: "flex", flexDirection: "column", transition: "width .2s ease", zIndex: 40 }}>
      <Logo collapsed={collapsed} />
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: 12, flex: 1 }}>
        {NAV.map((n) => {
          const active = page === n.id;
          const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => navigate(n.id)} title={collapsed ? n.label : undefined} className={"ms-nav" + (active ? " active" : "")}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, height: 40, padding: collapsed ? 0 : "0 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "IBM Plex Sans", fontSize: 13.5, fontWeight: active ? 600 : 500, background: active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", color: active ? "var(--accent)" : "var(--tx-3)", transition: "background .15s, color .15s" }}>
              {active && <span style={{ position: "absolute", left: collapsed ? 0 : -12, top: 8, bottom: 8, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
              <span style={{ display: "inline-flex", color: active ? "var(--accent)" : "var(--tx-dim)" }}><Icon size={19} /></span>
              {!collapsed && <span>{n.label}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{ padding: 12, borderTop: "1px solid var(--bd)" }}>
        <button onClick={() => setCollapsed((c) => !c)} className="ms-nav"
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", height: 38, padding: collapsed ? 0 : "0 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "var(--tx-dim)", fontFamily: "IBM Plex Sans", fontSize: 13 }}>
          <span style={{ display: "inline-flex", transform: collapsed ? "rotate(180deg)" : "none", transition: "transform .2s" }}><ChevronLeft size={18} /></span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
