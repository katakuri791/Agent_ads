import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { api, ApiError, type MetaAccount } from "../lib/api";
import { AuthUser, displayName, setCachedUser } from "../lib/auth";
import { Avatar, MSButton, StatusBadge } from "../components/ms/primitives";
import { useToast } from "../providers/ToastProvider";
import { useAccount } from "../providers/AccountProvider";
import { useMetaAccounts, useAccountMutations, type AccountPatch } from "../hooks/useMetaAccounts";

const SETTINGS_TABS = ["Profile", "Meta API Keys", "Appearance"];
const inputStyle: CSSProperties = { height: 40, background: "#111318", border: "1px solid #1E2128", borderRadius: 8, padding: "0 12px", fontSize: 14, color: "#D1D5DB", fontFamily: "IBM Plex Sans", outline: "none", width: "100%" };

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18, maxWidth: 460 }}>
      <label style={{ fontSize: 12.5, fontWeight: 500, color: "#D1D5DB" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "#6B7280" }}>{hint}</span>}
    </div>
  );
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  return <input {...props} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ ...inputStyle, borderColor: f ? "#1877F2" : "#1E2128", ...(props.style || {}) }} />;
}

function ProfileTab({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ first_name: user.first_name || "", last_name: user.last_name || "", company: user.company || "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ first_name: user.first_name || "", last_name: user.last_name || "", company: user.company || "" }); }, [user.id]);
  const save = async () => {
    setSaving(true);
    try { const u = await api.updateProfile(form); setCachedUser(u); onUserChange(u); toast("Profile saved", { kind: "success" }); }
    catch (e) { toast("Save failed", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }); }
    finally { setSaving(false); }
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Avatar name={displayName(user)} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MSButton variant="outline" size="sm">Upload photo</MSButton>
          <span style={{ fontSize: 11.5, color: "#6B7280" }}>JPG, PNG or GIF. Max 2MB.</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 460 }}>
        <Field label="First name"><TextInput value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} /></Field>
        <Field label="Last name"><TextInput value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} /></Field>
      </div>
      <Field label="Email"><TextInput value={user.email} disabled style={{ color: "#6B7280", cursor: "not-allowed" }} /></Field>
      <Field label="Company"><TextInput value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></Field>
      <div style={{ marginTop: 8 }}><MSButton variant="primary" onClick={save} disabled={saving} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>Save changes</MSButton></div>
    </div>
  );
}

/** Formulaire d'ajout / édition d'une clé Meta. Plus de préfixe `act_` requis :
 *  l'utilisateur tape les chiffres, le backend normalise en `act_<digits>`. */
function AccountForm({ initial, onCancel, onSubmit, saving }: {
  initial?: MetaAccount | null;
  onCancel: () => void;
  onSubmit: (patch: AccountPatch) => void;
  saving: boolean;
}) {
  const editing = !!initial;
  const [label, setLabel] = useState(initial?.label || "");
  const [token, setToken] = useState("");
  const [acct, setAcct] = useState(initial?.meta_ad_account_id?.replace(/^act_/, "") || "");
  const [pageId, setPageId] = useState(initial?.meta_page_id || "");
  const [pixelId, setPixelId] = useState(initial?.meta_pixel_id || "");
  const [isDefault, setIsDefault] = useState(initial?.is_default || false);

  const submit = () => {
    const patch: AccountPatch = {};
    patch.label = label.trim() || (editing ? initial!.label : "");
    if (token.trim()) patch.meta_access_token = token.trim();
    // Champ envoyé tel quel (avec ou sans act_) → normalisé côté serveur.
    patch.meta_ad_account_id = acct.trim();
    patch.meta_page_id = pageId.trim();
    patch.meta_pixel_id = pixelId.trim();
    patch.is_default = isDefault;
    onSubmit(patch);
  };

  return (
    <div style={{ border: "1px dashed #2A2E37", borderRadius: 12, padding: 20, marginBottom: 12, background: "#0E1015" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#F9FAFB", marginBottom: 16 }}>{editing ? "Modifier la clé" : "Ajouter une clé API"}</div>
      <Field label="Nom de la clé"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Compte FR, Client X…" /></Field>
      <Field label="Access Token" hint={editing ? "Laisse vide pour conserver le token actuel." : "Stocké masqué — privilégie un token System User longue durée."}>
        <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder={editing ? "•••••••• (inchangé)" : "EAAB..."} rows={3} style={{ ...inputStyle, height: "auto", padding: 12, fontFamily: "JetBrains Mono", fontSize: 13, resize: "vertical", lineHeight: 1.5 }} />
      </Field>
      <Field label="Ad Account ID" hint="Pas besoin de taper « act_ » — juste les chiffres (on l'ajoute pour toi).">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <span style={{ height: 40, display: "inline-flex", alignItems: "center", padding: "0 10px", background: "#0B0D11", border: "1px solid #1E2128", borderRight: "none", borderRadius: "8px 0 0 8px", color: "#6B7280", fontFamily: "JetBrains Mono", fontSize: 13 }}>act_</span>
          <TextInput value={acct} onChange={(e) => setAcct(e.target.value.replace(/^act_/, ""))} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono", borderRadius: "0 8px 8px 0" }} />
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 460 }}>
        <Field label="Page ID (optional)"><TextInput value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
        <Field label="Pixel ID (optional)"><TextInput value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#D1D5DB", marginBottom: 16, cursor: "pointer", maxWidth: 460 }}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} style={{ accentColor: "#1877F2" }} />
        Définir comme compte par défaut
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <MSButton variant="ghost" onClick={onCancel}>Annuler</MSButton>
        <MSButton variant="primary" onClick={submit} disabled={saving} icon={saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}>{editing ? "Enregistrer" : "Ajouter & vérifier"}</MSButton>
      </div>
    </div>
  );
}

function AccountCard({ account, onTest, onEdit, onDelete, onSetDefault, testing }: {
  account: MetaAccount;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  testing: boolean;
}) {
  const a = account;
  return (
    <div style={{ border: "1px solid " + (a.is_default ? "#1877F240" : "#1E2128"), background: a.is_default ? "#1877F208" : "#0E1015", borderRadius: 12, padding: 18, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span style={{ color: a.meta_access_token_set ? "#1877F2" : "#6B7280", display: "inline-flex", marginTop: 2 }}><Star size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "DM Sans", fontSize: 14, fontWeight: 700, color: "#F9FAFB" }}>{a.label}</span>
              <StatusBadge status={a.meta_access_token_set ? "Valid" : "No token"} dot />
              {a.is_default && <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#1877F2", fontWeight: 600 }}>Default</span>}
            </div>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#9AA1AC", marginTop: 8 }}>{a.meta_ad_account_id || "—"}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>{a.meta_page_id ? `Page ${a.meta_page_id}` : "Aucune page"}{a.meta_pixel_id ? ` · Pixel ${a.meta_pixel_id}` : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!a.is_default && <MSButton variant="outline" size="sm" onClick={onSetDefault}>Par défaut</MSButton>}
          <MSButton variant="outline" size="sm" onClick={onTest} icon={testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}>{testing ? "Test…" : "Test"}</MSButton>
          <MSButton variant="outline" size="sm" onClick={onEdit}>Éditer</MSButton>
          <MSButton variant="outline" size="sm" danger onClick={onDelete} icon={<Trash2 size={13} />}>Suppr.</MSButton>
        </div>
      </div>
    </div>
  );
}

function AccountsTab() {
  const toast = useToast();
  const { selectedAccountId, setSelectedAccountId } = useAccount();
  const { data: accounts, isLoading } = useMetaAccounts();
  const { create, update, remove } = useAccountMutations();
  const [mode, setMode] = useState<{ kind: "add" } | { kind: "edit"; account: MetaAccount } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MetaAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const list = accounts || [];

  const handleCreate = (patch: AccountPatch) => {
    create.mutate(patch, {
      onSuccess: (acct) => { setMode(null); if (patch.is_default || list.length === 0) setSelectedAccountId(acct.id); toast("Clé ajoutée", { kind: "success" }); },
      onError: (e) => toast("Échec", { kind: "error", msg: e instanceof ApiError ? e.message : String(e) }),
    });
  };
  const handleUpdate = (id: string, patch: AccountPatch) => {
    update.mutate({ id, body: patch }, {
      onSuccess: () => { setMode(null); toast("Clé mise à jour", { kind: "success" }); },
      onError: (e) => toast("Échec", { kind: "error", msg: e instanceof ApiError ? e.message : String(e) }),
    });
  };
  const handleDelete = (acct: MetaAccount) => {
    remove.mutate(acct.id, {
      onSuccess: () => { setConfirmDelete(null); if (selectedAccountId === acct.id) setSelectedAccountId(null); toast("Clé supprimée", { kind: "success" }); },
      onError: (e) => toast("Échec", { kind: "error", msg: e instanceof ApiError ? e.message : String(e) }),
    });
  };
  const handleSetDefault = (acct: MetaAccount) => {
    update.mutate({ id: acct.id, body: { is_default: true } }, {
      onSuccess: () => { setSelectedAccountId(acct.id); toast("Compte par défaut mis à jour", { kind: "success" }); },
      onError: (e) => toast("Échec", { kind: "error", msg: e instanceof ApiError ? e.message : String(e) }),
    });
  };
  const handleTest = async (acct: MetaAccount) => {
    setTestingId(acct.id);
    try {
      const r = await api.testAccount(acct.id);
      r.ok ? toast("Token valide", { kind: "success", msg: r.account_name }) : toast("Validation échouée", { kind: "error", msg: r.error });
    } catch (e) { toast("Validation échouée", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }); }
    finally { setTestingId(null); }
  };

  if (isLoading) return <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Loader2 size={20} className="animate-spin" style={{ color: "#1877F2" }} /></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h3 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "#F9FAFB", margin: 0 }}>Meta API Keys</h3>
          <p style={{ fontSize: 12.5, color: "#6B7280", margin: "4px 0 0" }}>Connecte plusieurs clés et bascule entre tes comptes depuis le filtre du dashboard.</p>
        </div>
        {!mode && <MSButton variant="primary" icon={<Plus size={16} />} onClick={() => setMode({ kind: "add" })}>Ajouter une clé</MSButton>}
      </div>

      {mode?.kind === "add" && <AccountForm onCancel={() => setMode(null)} onSubmit={handleCreate} saving={create.isPending} />}
      {mode?.kind === "edit" && <AccountForm initial={mode.account} onCancel={() => setMode(null)} onSubmit={(patch) => handleUpdate(mode.account.id, patch)} saving={update.isPending} />}

      {list.length === 0 && !mode && (
        <div style={{ textAlign: "center", padding: 40, color: "#6B7280", fontSize: 13.5, border: "1px dashed #1E2128", borderRadius: 12 }}>Aucune clé API. Ajoutes-en une pour commencer.</div>
      )}

      {list.map((a) => (
        <AccountCard key={a.id} account={a}
          testing={testingId === a.id}
          onTest={() => handleTest(a)}
          onEdit={() => setMode({ kind: "edit", account: a })}
          onDelete={() => setConfirmDelete(a)}
          onSetDefault={() => handleSetDefault(a)} />
      ))}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)" }} onClick={() => setConfirmDelete(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, background: "#16181F", border: "1px solid #1E2128", borderRadius: 14, padding: 24, boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#EF444415", border: "1px solid #EF444430", color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Trash2 size={20} /></div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "#F9FAFB", marginBottom: 6 }}>Supprimer « {confirmDelete.label} » ?</div>
            <div style={{ fontSize: 13.5, color: "#9AA1AC", lineHeight: 1.5, marginBottom: 20 }}>Action irréversible — les données de ce compte ne seront plus synchronisées.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <MSButton variant="outline" onClick={() => setConfirmDelete(null)}>Annuler</MSButton>
              <MSButton variant="primary" danger onClick={() => handleDelete(confirmDelete)} disabled={remove.isPending} style={{ background: "#EF4444", borderColor: "#EF4444", color: "#fff" }}>Supprimer</MSButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppearanceTab() {
  const toast = useToast();
  const [theme, setTheme] = useState("Dark");
  const [accent, setAccent] = useState("#1877F2");
  const accents = ["#1877F2", "#22C55E", "#A855F7", "#F59E0B", "#EF4444"];
  return (
    <div>
      <Field label="Theme">
        <div style={{ display: "flex", gap: 10 }}>
          {["Dark", "Dim", "System"].map((t) => (
            <button key={t} onClick={() => setTheme(t)} style={{ flex: 1, maxWidth: 130, padding: "14px 12px", borderRadius: 10, border: "1px solid " + (theme === t ? "#1877F2" : "#1E2128"), background: theme === t ? "#1877F210" : "#111318", color: theme === t ? "#F9FAFB" : "#9AA1AC", cursor: "pointer", fontSize: 13, fontFamily: "IBM Plex Sans" }}>
              <div style={{ height: 30, borderRadius: 6, marginBottom: 8, background: t === "Dark" ? "#0A0C10" : t === "Dim" ? "#1A1D24" : "linear-gradient(90deg,#0A0C10 50%,#F9FAFB 50%)", border: "1px solid #1E2128" }} />{t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Accent color">
        <div style={{ display: "flex", gap: 10 }}>
          {accents.map((c) => (
            <button key={c} onClick={() => setAccent(c)} style={{ width: 34, height: 34, borderRadius: 999, background: c, border: accent === c ? "2px solid #F9FAFB" : "2px solid transparent", outline: accent === c ? "2px solid " + c : "none", outlineOffset: 2, cursor: "pointer" }} />
          ))}
        </div>
      </Field>
      <MSButton variant="primary" onClick={() => toast("Appearance saved", { kind: "success" })}>Save changes</MSButton>
    </div>
  );
}

export function SettingsPage({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const [tab, setTab] = useState("Meta API Keys");
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0 }}>
        {SETTINGS_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="ms-nav" style={{ textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: tab === t ? 600 : 500, fontFamily: "IBM Plex Sans", background: tab === t ? "#1877F215" : "transparent", color: tab === t ? "#fff" : "#9AA1AC" }}>{t}</button>
        ))}
      </div>
      <div style={{ flex: 1, maxWidth: 720, minWidth: 0 }}>
        {tab === "Profile" && <ProfileTab user={user} onUserChange={onUserChange} />}
        {tab === "Meta API Keys" && <AccountsTab />}
        {tab === "Appearance" && <AppearanceTab />}
      </div>
    </div>
  );
}
