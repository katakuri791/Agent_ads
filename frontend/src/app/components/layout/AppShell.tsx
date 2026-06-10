import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthUser } from "../../lib/auth";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { OverviewPage } from "../../pages/OverviewPage";
import { CampaignsPage } from "../../pages/CampaignsPage";
import { PageAnalysisPage } from "../../pages/PageAnalysisPage";
import { AudiencesPage } from "../../pages/AudiencesPage";
import { AIAgentPage } from "../../pages/AIAgentPage";
import { SettingsPage } from "../../pages/SettingsPage";

/** Coquille de l'app authentifiée : sidebar + topbar (avec les filtres globaux)
 *  + routage par état `page`. */
export function AppShell({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const [page, setPage] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useCallback((id: string) => setPage(id), []);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 1180) setCollapsed(true); };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const goToSettings = () => navigate("settings");
  const goToAgent = () => navigate("ai");

  const pages: Record<string, ReactNode> = {
    overview: <OverviewPage onGoToSettings={goToSettings} />,
    campaigns: <CampaignsPage onGoToSettings={goToSettings} onAskAgent={goToAgent} />,
    page: <PageAnalysisPage onGoToSettings={goToSettings} />,
    audiences: <AudiencesPage onGoToSettings={goToSettings} />,
    ai: <AIAgentPage />,
    settings: <SettingsPage user={user} onUserChange={onUserChange} />,
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "#0A0C10", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <Sidebar page={page} navigate={navigate} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        <Topbar page={page} user={user} onGoToSettings={goToSettings} />
        <main style={{ flex: 1, overflow: page === "ai" ? "hidden" : "auto", position: "relative" }}>
          <div key={page} className="ms-page" style={{ minHeight: "100%", height: page === "ai" ? "100%" : undefined, padding: page === "ai" ? 0 : 32 }}>
            {pages[page] || pages.overview}
          </div>
        </main>
      </div>
    </div>
  );
}
