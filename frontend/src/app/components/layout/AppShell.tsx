import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthUser } from "../../lib/auth";
import { getUrlParam, onUrlChange, setUrlParams } from "../../lib/url";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { OverviewPage } from "../../pages/OverviewPage";
import { CampaignsPage } from "../../pages/CampaignsPage";
import { PageAnalysisPage } from "../../pages/PageAnalysisPage";
import { AudiencesPage } from "../../pages/AudiencesPage";
import { AIAgentPage } from "../../pages/AIAgentPage";
import { SettingsPage } from "../../pages/SettingsPage";

/** Sections valides — sert à valider le param d'URL `view` (toute valeur inconnue
 *  retombe sur "overview"). Doit rester aligné avec les clés de `pages` ci-dessous. */
const PAGES = ["overview", "campaigns", "page", "audiences", "ai", "settings"] as const;
const validPage = (v: string | null): string => (v && (PAGES as readonly string[]).includes(v) ? v : "overview");

/** Coquille de l'app authentifiée : sidebar + topbar (avec les filtres globaux)
 *  + routage par état `page`, mirroré dans l'URL (?view=…). */
export function AppShell({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const [page, setPage] = useState(() => validPage(getUrlParam("view")));
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useCallback((id: string) => { setPage(id); setUrlParams({ view: id }); }, []);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 1180) setCollapsed(true); };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Boutons précédent/suivant du navigateur → resync la section depuis l'URL.
  useEffect(() => onUrlChange(() => setPage(validPage(getUrlParam("view")))), []);

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
