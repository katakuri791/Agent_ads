import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { AccountUser } from "../lib/api";
import { Card, SectionTitle, LoadingOverlay, MSButton } from "../components/ms/primitives";
import { ConnectPrompt, ErrorState } from "../components/shared/states";
import { useAccountUsers, errStatus, errMessage } from "../hooks/useMetaData";

// Couleur de rôle : Admin = accent, Advertiser = vert, Analyst = ambre, sinon dim.
const ROLE_COLOR: Record<string, string> = {
  Admin: "var(--accent)", Advertiser: "#10B981", Analyst: "#F59E0B", Draft: "#64748B",
};

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLOR[role] || "var(--tx-dim)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)` }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {role}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

export function AccessPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const usersQ = useAccountUsers();
  const users: AccountUser[] = usersQ.data?.users ?? [];
  const blocked = usersQ.data?.blocked_reason ?? null;

  if (!usersQ.data) {
    if (errStatus(usersQ.error) === 400)
      return <ConnectPrompt onGoToSettings={onGoToSettings} message="Connecte ton compte Meta dans Settings pour voir les accès." />;
    if (usersQ.isError)
      return <ErrorState message={errMessage(usersQ.error) || "Erreur"} onRetry={() => usersQ.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement des accès au compte…"]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => usersQ.refetch()}>Rafraîchir</MSButton>
      </div>

      <Card pad={20} style={{ position: "relative" }}>
        {usersQ.isFetching && usersQ.data && <LoadingOverlay messages={["Mise à jour des accès…"]} />}
        <SectionTitle right={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tx-dim)" }}><ShieldCheck size={14} />{users.length} personne(s)</span>}>
          Personnes ayant accès au compte publicitaire
        </SectionTitle>
        {blocked ? (
          <div style={{ display: "flex", gap: 10, padding: "13px 15px", borderRadius: 10, background: "var(--surf-2)", border: "1px solid var(--bd)", color: "var(--tx-3)", fontSize: 12.5, marginTop: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
            <span>{blocked}</span>
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucune personne assignée à ce compte.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {users.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "DM Sans", flexShrink: 0 }}>{initials(u.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: "var(--tx)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--tx-dim)" }}>ID {u.id}</div>
                </div>
                {u.tasks.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--tx-dim)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.tasks.join(", ")}>{u.tasks.join(" · ")}</span>
                )}
                <RoleBadge role={u.role} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
