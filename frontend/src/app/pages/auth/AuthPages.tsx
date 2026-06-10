import { useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Lock, Mail } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { AuthUser } from "../../lib/auth";
import { MSButton } from "../../components/ms/primitives";

function AuthShell({ heading, subtitle, children, footer }: { heading: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#0A0C10" }}>
      <div className="ms-auth-side" style={{ width: 420, flexShrink: 0, padding: 40, borderRight: "1px solid #1E2128", background: "#0C0E13", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 12, height: 12, borderRadius: 999, border: "2.5px solid #fff" }} /></div>
          <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "#F9FAFB" }}>MetaScope</span>
        </div>
        <div>
          <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 30, color: "#F9FAFB", lineHeight: 1.2, margin: 0 }}>Your Meta Ads<br />command center.</h2>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 300, marginTop: 16 }}>Create, analyze, and optimize Facebook advertising campaigns through natural language. The agent handles the API.</p>
        </div>
        <p style={{ fontSize: 11, color: "#4B5260" }}>MetaScope · Powered by LangGraph + Meta Marketing API</p>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 24, color: "#F9FAFB", margin: 0, marginBottom: 6 }}>{heading}</h1>
            <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>{subtitle}</p>
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}

function AuthInput({ icon, ...props }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 42, borderRadius: 8, background: "#111318", border: "1px solid " + (f ? "#1877F2" : "#1E2128"), transition: "border-color .15s" }}>
      <span style={{ color: "#6B7280", display: "inline-flex" }}>{icon}</span>
      <input {...props} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F9FAFB", fontSize: 14, fontFamily: "IBM Plex Sans" }} />
    </div>
  );
}

export function LoginPage({ onAuth, onGoToSignup }: { onAuth: (u: AuthUser) => void; onGoToSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null);
    if (!email || !password) { setError("Please fill in both fields."); return; }
    setLoading(true);
    try { onAuth(await api.login(email, password)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Login failed."); }
    finally { setLoading(false); }
  };
  return (
    <AuthShell heading="Sign in" subtitle="Access your campaigns and analytics."
      footer={<p style={{ textAlign: "center", fontSize: 12.5, color: "#6B7280", marginTop: 24 }}>Don&apos;t have an account? <button onClick={onGoToSignup} style={{ background: "none", border: "none", color: "#1877F2", cursor: "pointer", fontWeight: 500, fontFamily: "IBM Plex Sans" }}>Sign up free</button></p>}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Email</label><AuthInput icon={<Mail size={15} />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /></div>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Password</label><AuthInput icon={<Lock size={15} />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></div>
        {error && <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12.5, color: "#FCA5A5", background: "#EF444412", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={13} />{error}</div>}
        <MSButton type="submit" variant="primary" disabled={loading} style={{ width: "100%", height: 42, marginTop: 4 }} icon={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}>{loading ? "Signing in…" : "Sign in"}</MSButton>
      </form>
    </AuthShell>
  );
}

export function SignupPage({ onAuth, onGoToLogin }: { onAuth: (u: AuthUser) => void; onGoToLogin: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setError(null);
    if (!email || !password) { setError("Email and password are required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try { onAuth(await api.signup(email, password, `${firstName} ${lastName}`.trim() || undefined)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Signup failed."); }
    finally { setLoading(false); }
  };
  return (
    <AuthShell heading="Create your account" subtitle="14-day trial · No credit card needed"
      footer={<p style={{ textAlign: "center", fontSize: 12.5, color: "#6B7280", marginTop: 20 }}>Already have an account? <button onClick={onGoToLogin} style={{ background: "none", border: "none", color: "#1877F2", cursor: "pointer", fontWeight: 500, fontFamily: "IBM Plex Sans" }}>Sign in</button></p>}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>First name</label><AuthInput icon={<></>} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" /></div>
          <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Last name</label><AuthInput icon={<></>} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" /></div>
        </div>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Work email</label><AuthInput icon={<Mail size={15} />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /></div>
        <div><label style={{ fontSize: 12.5, fontWeight: 500, color: "#9AA1AC", display: "block", marginBottom: 7 }}>Password</label><AuthInput icon={<Lock size={15} />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" /></div>
        {error && <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12.5, color: "#FCA5A5", background: "#EF444412", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={13} />{error}</div>}
        <MSButton type="submit" variant="primary" disabled={loading} style={{ width: "100%", height: 42, marginTop: 4 }} icon={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}>{loading ? "Creating account…" : "Create account"}</MSButton>
      </form>
    </AuthShell>
  );
}
