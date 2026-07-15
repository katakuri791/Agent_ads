import { useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, Eye, Heart, Instagram as IgIcon, MessageCircle, RefreshCw } from "lucide-react";
import type { IgPost, IgProfile } from "../lib/api";
import { fmtNum } from "../lib/format";
import { Card, SectionTitle, LoadingOverlay, MSButton, Placeholder } from "../components/ms/primitives";
import { ConnectPrompt, ErrorState } from "../components/shared/states";
import { useInstagram, errStatus, errMessage } from "../hooks/useMetaData";

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : "—";

function ProfileHeader({ profile }: { profile?: IgProfile | null }) {
  if (!profile) return null;
  const stats: Array<[string, string]> = [
    ["Followers", fmtNum(profile.followers_count)],
    ["Publications", fmtNum(profile.media_count)],
    ["Suivis", fmtNum(profile.follows_count)],
  ];
  return (
    <Card pad={20}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {profile.profile_picture_url
          ? <img src={profile.profile_picture_url} alt="" style={{ width: 64, height: 64, borderRadius: 999, objectFit: "cover", flexShrink: 0, border: "1px solid var(--bd)" }} />
          : <div style={{ width: 64, height: 64, borderRadius: 999, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IgIcon size={26} /></div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 20, color: "var(--tx)" }}>@{profile.username || "instagram"}</span>
            {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "inline-flex" }} title={profile.website}><ExternalLink size={15} /></a>}
          </div>
          {profile.name && <div style={{ fontSize: 13.5, color: "var(--tx-3)", marginTop: 2 }}>{profile.name}</div>}
          {profile.biography && <div style={{ fontSize: 12.5, color: "var(--tx-3)", marginTop: 6, maxWidth: 520, lineHeight: 1.5 }}>{profile.biography}</div>}
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {stats.map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 18, color: "var(--tx)" }}>{value}</div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PostMetric({ icon, value, title }: { icon: ReactNode; value: string; title: string }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--tx-3)" }}>
      {icon}{value}
    </span>
  );
}

function PostCard({ post }: { post: IgPost }) {
  const img = post.media_type === "VIDEO" ? (post.thumbnail_url || post.media_url) : (post.media_url || post.thumbnail_url);
  const kind = (post.media_product_type || post.media_type || "").replace("CAROUSEL_ALBUM", "ALBUM");
  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surf-2)" }}>
        {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Placeholder w={48} height={48} label="IMG" /></div>}
        {kind && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.55)", borderRadius: 5, padding: "2px 7px", textTransform: "uppercase", letterSpacing: ".04em" }}>{kind}</span>}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {/* Reach = « combien de gens ont vu cette publication » (chiffre principal). */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <Eye size={15} style={{ color: "var(--accent)", alignSelf: "center" }} />
          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 18, color: "var(--tx)" }}>{post.reach != null ? fmtNum(post.reach) : "—"}</span>
          <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>personnes touchées</span>
        </div>
        {post.caption && <div style={{ fontSize: 12.5, color: "var(--tx-2)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{post.caption}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto", paddingTop: 6, borderTop: "1px solid var(--bd-weak)" }}>
          <PostMetric icon={<Eye size={13} />} value={post.impressions != null ? fmtNum(post.impressions) : "—"} title="Impressions (vues totales)" />
          <PostMetric icon={<Heart size={13} />} value={fmtNum(post.like_count)} title="J'aime" />
          <PostMetric icon={<MessageCircle size={13} />} value={fmtNum(post.comments_count)} title="Commentaires" />
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--tx-dim)" }}>{fmtDate(post.timestamp)}</span>
            {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "inline-flex" }} title="Ouvrir sur Instagram"><ExternalLink size={14} /></a>}
          </span>
        </div>
      </div>
    </div>
  );
}

// Un post est un Reel si Meta le marque REELS (media_product_type), sinon c'est
// une publication classique (feed / photo / carrousel).
const isReel = (p: IgPost) => (p.media_product_type || "").toUpperCase() === "REELS";

export function InstagramPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const igQ = useInstagram();
  const [filter, setFilter] = useState<"all" | "posts" | "reels">("all");
  const data = igQ.data ?? null;
  const blocked = data?.blocked_reason ?? null;
  const allPosts = data?.posts ?? [];
  const reelsCount = allPosts.filter(isReel).length;
  const postsCount = allPosts.length - reelsCount;
  const posts = filter === "all" ? allPosts : filter === "reels" ? allPosts.filter(isReel) : allPosts.filter((p) => !isReel(p));

  if (!igQ.data) {
    if (errStatus(igQ.error) === 400)
      return <ConnectPrompt onGoToSettings={onGoToSettings} message="Connecte ton compte Meta (Page + Instagram) dans Settings." />;
    if (igQ.isError)
      return <ErrorState message={errMessage(igQ.error) || "Erreur"} onRetry={() => igQ.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement du compte Instagram…", "Récupération des posts et de leur portée…"]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, position: "relative" }}>
      {igQ.isFetching && igQ.data && <LoadingOverlay messages={["Mise à jour Instagram…"]} />}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <MSButton variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => igQ.refetch()}>Rafraîchir</MSButton>
      </div>

      {blocked ? (
        <Card pad={22}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "color-mix(in srgb, #E1306C 14%, transparent)", color: "#E1306C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IgIcon size={20} /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>Instagram non connecté</div>
              <div style={{ display: "flex", gap: 8, color: "var(--tx-3)", fontSize: 12.5, lineHeight: 1.55 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
                <span style={{ whiteSpace: "pre-line" }}>{blocked}</span>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <ProfileHeader profile={data?.profile} />
          <SectionTitle right={
            <div style={{ display: "inline-flex", background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 9, padding: 3, gap: 2 }}>
              {([["all", `Tous (${allPosts.length})`], ["posts", `Posts (${postsCount})`], ["reels", `Reels (${reelsCount})`]] as const).map(([key, lbl]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 7, cursor: "pointer", border: "none",
                    background: filter === key ? "var(--accent)" : "transparent",
                    color: filter === key ? "#fff" : "var(--tx-3)",
                    fontFamily: "inherit",
                  }}
                >{lbl}</button>
              ))}
            </div>
          }>Publications &amp; portée</SectionTitle>
          {posts.length === 0 ? (
            <Card pad={28}><div style={{ textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>{allPosts.length === 0 ? "Aucune publication sur ce compte Instagram." : `Aucun ${filter === "reels" ? "Reel" : "post"} à afficher.`}</div></Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {posts.map((p) => <PostCard key={p.id} post={p} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
