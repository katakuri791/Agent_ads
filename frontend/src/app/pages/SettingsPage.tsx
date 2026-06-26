import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { api, ApiError, type MetaAccount } from "../lib/api";
import { AuthUser, displayName, setCachedUser } from "../lib/auth";
import { Avatar, MSButton, StatusBadge } from "../components/ms/primitives";
import { useToast } from "../providers/ToastProvider";
import { useAccount } from "../providers/AccountProvider";
import { useTheme, type ThemeMode } from "../providers/ThemeProvider";
import { useMetaAccounts, useAccountMutations, type AccountPatch } from "../hooks/useMetaAccounts";

const SETTINGS_TABS = ["Profile", "Meta API Keys", "Appearance"];
const inputStyle: CSSProperties = { height: 40, background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 14, color: "var(--tx-2)", fontFamily: "IBM Plex Sans", outline: "none", width: "100%" };

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18, maxWidth: 460 }}>
      <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--tx-2)" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>{hint}</span>}
    </div>
  );
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  return <input {...props} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ ...inputStyle, borderColor: f ? "var(--accent)" : "var(--bd)", ...(props.style || {}) }} />;
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
          <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>JPG, PNG or GIF. Max 2MB.</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 460 }}>
        <Field label="First name"><TextInput value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} /></Field>
        <Field label="Last name"><TextInput value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} /></Field>
      </div>
      <Field label="Email"><TextInput value={user.email} disabled style={{ color: "var(--tx-dim)", cursor: "not-allowed" }} /></Field>
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
    <div style={{ border: "1px dashed var(--sw)", borderRadius: 12, padding: 20, marginBottom: 12, background: "var(--surf-2)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx)", marginBottom: 16 }}>{editing ? "Modifier la clé" : "Ajouter une clé API"}</div>
      <Field label="Nom de la clé"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Compte FR, Client X…" /></Field>
      <Field label="Access Token" hint={editing ? "Laisse vide pour conserver le token actuel." : "Stocké masqué — privilégie un token System User longue durée."}>
        <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder={editing ? "•••••••• (inchangé)" : "EAAB..."} rows={3} style={{ ...inputStyle, height: "auto", padding: 12, fontFamily: "JetBrains Mono", fontSize: 13, resize: "vertical", lineHeight: 1.5 }} />
      </Field>
      <Field label="Ad Account ID" hint="Pas besoin de taper « act_ » — juste les chiffres (on l'ajoute pour toi).">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <span style={{ height: 40, display: "inline-flex", alignItems: "center", padding: "0 10px", background: "#0B0D11", border: "1px solid var(--bd)", borderRight: "none", borderRadius: "8px 0 0 8px", color: "var(--tx-dim)", fontFamily: "JetBrains Mono", fontSize: 13 }}>act_</span>
          <TextInput value={acct} onChange={(e) => setAcct(e.target.value.replace(/^act_/, ""))} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono", borderRadius: "0 8px 8px 0" }} />
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 460 }}>
        <Field label="Page ID (optional)"><TextInput value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
        <Field label="Pixel ID (optional)"><TextInput value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="1234567890" style={{ fontFamily: "JetBrains Mono" }} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--tx-2)", marginBottom: 16, cursor: "pointer", maxWidth: 460 }}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
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
    <div style={{ border: "1px solid " + (a.is_default ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "var(--bd)"), background: a.is_default ? "color-mix(in srgb, var(--accent) 3%, transparent)" : "var(--surf-2)", borderRadius: 12, padding: 18, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span style={{ color: a.meta_access_token_set ? "var(--accent)" : "var(--tx-dim)", display: "inline-flex", marginTop: 2 }}><Star size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "DM Sans", fontSize: 14, fontWeight: 700, color: "var(--tx)" }}>{a.label}</span>
              <StatusBadge status={a.meta_access_token_set ? "Valid" : "No token"} dot />
              {a.is_default && <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", fontWeight: 600 }}>Default</span>}
            </div>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 12.5, color: "var(--tx-3)", marginTop: 8 }}>{a.meta_ad_account_id || "—"}</div>
            <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 6 }}>{a.meta_page_id ? `Page ${a.meta_page_id}` : "Aucune page"}{a.meta_pixel_id ? ` · Pixel ${a.meta_pixel_id}` : ""}</div>
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

  if (isLoading) return <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} /></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h3 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "var(--tx)", margin: 0 }}>Meta API Keys</h3>
          <p style={{ fontSize: 12.5, color: "var(--tx-dim)", margin: "4px 0 0" }}>Connecte plusieurs clés et bascule entre tes comptes depuis le filtre du dashboard.</p>
        </div>
        {!mode && <MSButton variant="primary" icon={<Plus size={16} />} onClick={() => setMode({ kind: "add" })}>Ajouter une clé</MSButton>}
      </div>

      {mode?.kind === "add" && <AccountForm onCancel={() => setMode(null)} onSubmit={handleCreate} saving={create.isPending} />}
      {mode?.kind === "edit" && <AccountForm initial={mode.account} onCancel={() => setMode(null)} onSubmit={(patch) => handleUpdate(mode.account.id, patch)} saving={update.isPending} />}

      {list.length === 0 && !mode && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--tx-dim)", fontSize: 13.5, border: "1px dashed var(--bd)", borderRadius: 12 }}>Aucune clé API. Ajoutes-en une pour commencer.</div>
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
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 14, padding: 24, boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#EF444415", border: "1px solid #EF444430", color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Trash2 size={20} /></div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "var(--tx)", marginBottom: 6 }}>Supprimer « {confirmDelete.label} » ?</div>
            <div style={{ fontSize: 13.5, color: "var(--tx-3)", lineHeight: 1.5, marginBottom: 20 }}>Action irréversible — les données de ce compte ne seront plus synchronisées.</div>
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
  const { theme, accent, setTheme, setAccent } = useTheme();
  const themes: Array<{ label: string; val: ThemeMode; preview: string }> = [
    { label: "Dark", val: "dark", preview: "#0A0C10" },
    { label: "Light", val: "light", preview: "#F3F5F9" },
    { label: "Dim", val: "dim", preview: "#12151C" },
    { label: "System", val: "system", preview: "linear-gradient(90deg,#0A0C10 50%,#F3F5F9 50%)" },
  ];
  const accents = ["#1877F2", "#22C55E", "#A855F7", "#F59E0B", "#EF4444", "#06B6D4"];
  const isAccent = (c: string) => accent.toLowerCase() === c.toLowerCase();
  return (
    <div>
      <Field label="Theme" hint="Dark (défaut), Light (clair), Dim (fonds relevés), ou System (suit ton OS).">
        <div style={{ display: "flex", gap: 10 }}>
          {themes.map((t) => (
            <button key={t.val} onClick={() => setTheme(t.val)} style={{ flex: 1, maxWidth: 130, padding: "14px 12px", borderRadius: 10, border: "1px solid " + (theme === t.val ? "var(--accent)" : "var(--bd)"), background: theme === t.val ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--surf-card)", color: theme === t.val ? "var(--tx)" : "var(--tx-3)", cursor: "pointer", fontSize: 13, fontFamily: "IBM Plex Sans" }}>
              <div style={{ height: 30, borderRadius: 6, marginBottom: 8, background: t.preview, border: "1px solid var(--bd)" }} />{t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Accent color" hint="Appliqué instantanément à toute l'interface.">
        <div style={{ display: "flex", gap: 10 }}>
          {accents.map((c) => (
            <button key={c} onClick={() => setAccent(c)} title={c} style={{ width: 34, height: 34, borderRadius: 999, background: c, border: isAccent(c) ? "2px solid var(--tx)" : "2px solid transparent", outline: isAccent(c) ? "2px solid " + c : "none", outlineOffset: 2, cursor: "pointer" }} />
          ))}
        </div>
      </Field>
    </div>
  );
}

export function SettingsPage({ user, onUserChange }: { user: AuthUser; onUserChange: (u: AuthUser) => void }) {
  const [tab, setTab] = useState("Meta API Keys");
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0 }}>
        {SETTINGS_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="ms-nav" style={{ textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: tab === t ? 600 : 500, fontFamily: "IBM Plex Sans", background: tab === t ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", color: tab === t ? "#fff" : "var(--tx-3)" }}>{t}</button>
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
