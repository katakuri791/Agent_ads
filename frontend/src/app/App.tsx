import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "./lib/api";
import { AuthUser, getCachedUser, getToken } from "./lib/auth";
import { AppProviders } from "./providers/AppProviders";
import { ThemeProvider } from "./providers/ThemeProvider";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage, SignupPage } from "./pages/auth/AuthPages";

// Coquille fine : porte d'authentification + providers (TanStack Query, toasts,
// compte sélectionné, filtres globaux) + AppShell. Toute la logique métier vit
// désormais dans pages/, hooks/, providers/ et components/.
function AppInner() {
  const [user, setUser] = useState<AuthUser | null>(() => getCachedUser());
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    if (!getToken()) { setBootstrapping(false); return; }
    api.me().then((u) => setUser(u)).catch(() => setUser(null)).finally(() => setBootstrapping(false));
  }, []);

  if (bootstrapping) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}><Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} /></div>;
  }
  if (!user) {
    return authView === "signup"
      ? <SignupPage onAuth={setUser} onGoToLogin={() => setAuthView("login")} />
      : <LoginPage onAuth={setUser} onGoToSignup={() => setAuthView("signup")} />;
  }

  return (
    <AppProviders>
      <AppShell user={user} onUserChange={setUser} />
    </AppProviders>
  );
}

// ThemeProvider enveloppe TOUT (y compris login/bootstrap) pour appliquer le
// thème + la couleur d'accent dès le premier rendu, sur tous les écrans.
export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
