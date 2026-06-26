import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, ChevronDown, ExternalLink, Image as ImageIcon, Link2, X, ImagePlus, Film, Send, Loader2, PenSquare, ZoomIn } from "lucide-react";
import { api, ApiError, type PagePost } from "../lib/api";
import { qk } from "../lib/queryKeys";
import { fmtNum, fmtDateTimeFull } from "../lib/format";
import { Card, KPICard, Placeholder, SectionTitle, LoadingOverlay, type Kpi } from "../components/ms/primitives";
import { ConnectPrompt } from "../components/shared/states";
import { usePageData } from "../hooks/useMetaData";
import { useAccount } from "../providers/AccountProvider";
import { useToast } from "../providers/ToastProvider";

type PostSortKey = "date" | "engagement" | "reactions" | "comments" | "shares";

export function PageAnalysisPage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { data } = usePageData();
  const { selectedAccountId } = useAccount();
  const toast = useToast();
  const qc = useQueryClient();

  // Lightbox : image agrandie au clic sur une vignette de post.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Composer : modal de publication d'un nouveau post.
  const [composerOpen, setComposerOpen] = useState(false);

  const engagementReason = data?.summary?.engagement_blocked_reason;
  const apiErrorMsg = data?.apiError ?? null;
  const isEngagementIssue =
    !!data?.summary?.engagement_blocked ||
    (!!apiErrorMsg && /#10|pages_read_engagement/i.test(apiErrorMsg));

  // Détail technique réservé au développeur (console uniquement) — l'utilisateur,
  // lui, ne voit qu'un message court (cf. bannière ci-dessous). On ne logge qu'au
  // changement de cause pour éviter le spam à chaque rerender.
  useEffect(() => {
    if (isEngagementIssue) {
      console.warn("[Facebook API] Engagement load failed:", {
        reason: engagementReason || apiErrorMsg,
        accountId: selectedAccountId,
        endpoint: "GET /{page-id}/posts?fields=reactions.summary(total_count),comments.summary(total_count),shares",
        hint: "Token sans pages_read_engagement/pages_show_list — voir GET /meta/page-engagement-debug",
      });
    } else if (apiErrorMsg) {
      console.warn("[Meta API] Page data partially failed:", { reason: apiErrorMsg, accountId: selectedAccountId });
    }
  }, [isEngagementIssue, engagementReason, apiErrorMsg, selectedAccountId]);

  const [postSort, setPostSort] = useState<{ k: PostSortKey; dir: number }>({ k: "date", dir: -1 });
  const sortedPosts = useMemo(() => {
    const list = data?.summary?.posts || [];
    const eng = (p: PagePost) => p.reactions + p.comments + p.shares;
    return [...list].sort((a, b) => {
      let av: number, bv: number;
      if (postSort.k === "date") { av = a.created_time ? new Date(a.created_time).getTime() : 0; bv = b.created_time ? new Date(b.created_time).getTime() : 0; }
      else if (postSort.k === "engagement") { av = eng(a); bv = eng(b); }
      else { av = a[postSort.k]; bv = b[postSort.k]; }
      return (av - bv) * postSort.dir;
    });
  }, [data, postSort]);
  const clickPostSort = (k: PostSortKey) => setPostSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: -1 }));

  if (!data) return <LoadingOverlay fullPage delay={0} messages={["Chargement de la page Facebook…", "Récupération des posts et de l'engagement…"]} />;
  if (data.configError) return <ConnectPrompt onGoToSettings={onGoToSettings} message={data.configError} />;
  const { info, summary } = data;
  const engagementBlocked = !!summary?.engagement_blocked;
  const engCell = (n: number | undefined) => (engagementBlocked ? "—" : fmtNum(n || 0));

  const followers = info?.followers_count || info?.fan_count || 0;
  const topPosts = summary?.top_posts || [];
  const engTotal = (summary?.reactions || 0) + (summary?.comments || 0) + (summary?.shares || 0);
  // Grille unifiée façon nouveau design (6 tuiles), uniquement des champs réels.
  const kpis: Kpi[] = [
    { label: "Posts", value: fmtNum(summary?.posts_count || 0) },
    { label: "Likes", value: engCell(summary?.reactions) },
    { label: "Comments", value: engCell(summary?.comments) },
    { label: "Shares", value: engCell(summary?.shares) },
    { label: "Portée totale", value: fmtNum(summary?.reach_total || 0) },
    { label: "Engagement", value: engagementBlocked ? "—" : fmtNum(engTotal) },
  ];
  // Split organique / payant — totaux agrégés réels (l'API ne donne pas de série par jour).
  const reachOrganic = summary?.reach_organic || 0;
  const reachPaid = summary?.reach_paid || 0;
  const reachSum = reachOrganic + reachPaid;
  const organicPct = reachSum > 0 ? Math.round((reachOrganic / reachSum) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {isEngagementIssue ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B30", color: "#FCD9A0", fontSize: 12.5 }}>
          <Lock size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
          <span>
            Accès limité — les likes et commentaires nécessitent une autorisation supplémentaire.
            {" "}Tes posts et l'identité de la page restent affichés ; l'engagement est marqué « — ».
          </span>
        </div>
      ) : apiErrorMsg ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B30", color: "#FCD9A0", fontSize: 12.5 }}>
          <Lock size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
          <span>Certaines données Meta n'ont pas pu être chargées pour le moment. Le reste de la page reste affiché.</span>
        </div>
      ) : null}
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid var(--bd)" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg, #0d2748, #122b1f 60%, var(--bg))" }} />
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(60deg, rgba(255,255,255,.015) 0 10px, transparent 10px 20px)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 20, padding: 24 }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, overflow: "hidden", background: "linear-gradient(135deg,var(--accent),#0A57C2)", border: "3px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans", fontWeight: 700, fontSize: 30, color: "#fff", flexShrink: 0, boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>
            {info?.picture_url ? <img src={info.picture_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (info?.name?.[0] || "P")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 24, color: "var(--tx)", margin: 0, letterSpacing: "-.01em" }}>{info?.name || "Facebook Page"}</h2>
              {info?.category && <span style={{ fontSize: 11.5, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)", borderRadius: 999, padding: "3px 10px" }}>{info.category}</span>}
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
              <span style={{ fontSize: 13.5, color: "var(--tx-2)" }}><b style={{ fontFamily: "DM Sans", color: "var(--tx)" }}>{fmtNum(followers)}</b> followers</span>
              {info?.link && <a href={info.link} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 5 }}>View page <ExternalLink size={12} /></a>}
            </div>
          </div>
          <button onClick={() => setComposerOpen(true)} className="ms-btn-primary" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 8px 24px rgba(24,119,242,.35)" }}>
            <PenSquare size={16} /> Publier un post
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
        {kpis.map((k, i) => <KPICard key={k.label} kpi={k} idx={i} />)}
      </div>

      <Card>
        <SectionTitle>Portée organique vs payante <span style={{ fontSize: 12, fontWeight: 400, color: "var(--tx-dim)" }}>· 28 derniers jours</span></SectionTitle>
        {reachSum === 0 ? (
          <div style={{ padding: 12, color: "var(--tx-dim)", fontSize: 13 }}>Aucune donnée de portée sur la période.</div>
        ) : (
          <>
            <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: "var(--surf-inset)", border: "1px solid var(--bd)" }}>
              <div style={{ width: `${organicPct}%`, background: "var(--accent)", transition: "width .5s cubic-bezier(.34,1.32,.5,1)" }} />
              <div style={{ width: `${100 - organicPct}%`, background: "#22C55E", transition: "width .5s cubic-bezier(.34,1.32,.5,1)" }} />
            </div>
            <div style={{ display: "flex", gap: 28, marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--accent)" }} />
                <span style={{ fontSize: 12.5, color: "var(--tx-2)" }}>Organique</span>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: "var(--tx)", fontWeight: 700 }}>{fmtNum(reachOrganic)}</span>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--tx-dim)" }}>({organicPct}%)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: "#22C55E" }} />
                <span style={{ fontSize: 12.5, color: "var(--tx-2)" }}>Payante</span>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: "var(--tx)", fontWeight: 700 }}>{fmtNum(reachPaid)}</span>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--tx-dim)" }}>({100 - organicPct}%)</span>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>{engagementBlocked ? "Posts récents" : "Top 3 posts — meilleur engagement"}</SectionTitle>
        {topPosts.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>Aucun post trouvé.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {topPosts.map((p, i) => {
              const eng = p.reactions + p.comments + p.shares;
              return (
                <div key={p.id} className="ms-fade-up" style={{ animationDelay: `${i * 70}ms`, background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ position: "relative" }}>
                    {p.full_picture ? (
                      <button onClick={() => setLightbox(p.full_picture!)} title="Agrandir l'image" className="ms-thumb" style={{ display: "block", width: "100%", height: 120, padding: 0, border: "none", cursor: "zoom-in", background: "none", position: "relative" }}>
                        <img src={p.full_picture} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                        <span className="ms-thumb-zoom" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,13,31,.45)", color: "#fff", opacity: 0, transition: "opacity 160ms ease" }}><ZoomIn size={22} /></span>
                      </button>
                    ) : <Placeholder height={120} radius={0} />}
                    <span style={{ position: "absolute", top: 8, left: 8, background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono", borderRadius: 6, padding: "2px 7px", pointerEvents: "none" }}>#{i + 1}</span>
                  </div>
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: "var(--tx-2)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.message || "(sans texte)"}</div>
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "JetBrains Mono" }}>
                      <span style={{ color: "var(--tx-3)" }}>💙 {engCell(p.reactions)}</span>
                      <span style={{ color: "var(--tx-3)" }}>💬 {engCell(p.comments)}</span>
                      <span style={{ color: "var(--tx-3)" }}>🔁 {engCell(p.shares)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--tx-dim)", borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
                      {!engagementBlocked && <div>Engagement total : <b style={{ color: "#22C55E", fontFamily: "JetBrains Mono" }}>{fmtNum(eng)}</b></div>}
                      <div style={{ marginTop: 3 }}>{fmtDateTimeFull(p.created_time)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card pad={0}>
        <div style={{ padding: "18px 20px 12px" }}><SectionTitle>Posts Performance</SectionTitle></div>
        {(() => {
          const POST_GRID = "54px 2.6fr 0.9fr 0.9fr 0.9fr 0.9fr 1.4fr";
          const cols: Array<{ label: string; k?: PostSortKey; align: "left" | "right" }> = [
            { label: "", align: "left" },
            { label: "Post", align: "left" },
            { label: "Reactions", k: "reactions", align: "right" },
            { label: "Comments", k: "comments", align: "right" },
            { label: "Shares", k: "shares", align: "right" },
            { label: "Engagement", k: "engagement", align: "right" },
            { label: "Date / Heure", k: "date", align: "right" },
          ];
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: POST_GRID, gap: 10, padding: "0 20px 10px", borderBottom: "1px solid var(--bd)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)" }}>
                {cols.map((c, i) => c.k ? (
                  <button key={i} onClick={() => clickPostSort(c.k!)} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: c.align === "right" ? "flex-end" : "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: postSort.k === c.k ? "var(--tx-2)" : "var(--tx-dim)", fontFamily: "IBM Plex Sans", fontWeight: 500, padding: 0 }}>
                    <span>{c.label}</span>
                    <span style={{ display: "inline-flex", opacity: postSort.k === c.k ? 1 : 0.35, color: postSort.k === c.k ? "var(--accent)" : "var(--tx-dim)" }}>{postSort.k === c.k && postSort.dir === 1 ? <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={12} />}</span>
                  </button>
                ) : <span key={i} style={{ textAlign: c.align }}>{c.label}</span>)}
              </div>
              {sortedPosts.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--tx-dim)", fontSize: 13 }}>No posts found.</div>}
              {sortedPosts.map((p, i) => {
                const eng = p.reactions + p.comments + p.shares;
                return (
                  <div key={p.id} className="ms-trow" style={{ display: "grid", gridTemplateColumns: POST_GRID, gap: 10, alignItems: "center", padding: "12px 20px", borderBottom: i < sortedPosts.length - 1 ? "1px solid var(--bd-weak)" : "none" }}>
                    {p.full_picture ? <img src={p.full_picture} alt="" onClick={() => setLightbox(p.full_picture!)} title="Agrandir l'image" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", cursor: "zoom-in" }} /> : <Placeholder w={40} height={40} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ color: p.permalink_url ? "var(--accent)" : "var(--tx-dim)", display: "inline-flex", flexShrink: 0 }}>{p.full_picture ? <ImageIcon size={15} /> : <Link2 size={15} />}</span>
                      <span style={{ fontSize: 13.5, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.message || "(no text)"}</span>
                    </div>
                    {[p.reactions, p.comments, p.shares].map((v, k) => <span key={k} style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: k === 0 ? "var(--tx-2)" : "var(--tx-3)" }}>{engCell(v)}</span>)}
                    <span style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#22C55E" }}>{engagementBlocked ? "—" : fmtNum(eng)}</span>
                    <span style={{ textAlign: "right", fontSize: 12, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>{fmtDateTimeFull(p.created_time)}</span>
                  </div>
                );
              })}
            </>
          );
        })()}
      </Card>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {composerOpen && (
        <PostComposer
          accountId={selectedAccountId}
          pageName={info?.name || "votre page"}
          onClose={() => setComposerOpen(false)}
          onPublished={() => {
            qc.invalidateQueries({ queryKey: qk.page(selectedAccountId) });
            toast("Post publié", { kind: "success", msg: "Il apparaîtra sur ta page sous peu." });
            setComposerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Image agrandie plein écran — clic sur l'arrière-plan ou Échap pour fermer.
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="ms-fade-up" style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,13,31,.85)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, cursor: "zoom-out" }}>
      <button onClick={onClose} title="Fermer" style={{ position: "absolute", top: 20, right: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 999, border: "1px solid #2A2F3A", background: "var(--surf-pop)", color: "var(--tx-bright)", cursor: "pointer" }}><X size={20} /></button>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,.6)", cursor: "default" }} />
    </div>
  );
}

// Modal de publication d'un post (texte + image optionnelle).
function PostComposer({ accountId, pageName, onClose, onPublished }: {
  accountId: string | null;
  pageName: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [message, setMessage] = useState("");
  // Un seul média à la fois : image OU vidéo (comme la publication Facebook).
  const [media, setMedia] = useState<{ file: File; kind: "image" | "video" } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.createPagePost({
      message,
      image: media?.kind === "image" ? media.file : null,
      video: media?.kind === "video" ? media.file : null,
    }, accountId),
    onSuccess: onPublished,
  });
  const errMsg = mutation.error instanceof ApiError ? mutation.error.message
    : mutation.error ? "La publication a échoué. Réessaie." : null;

  const pickMedia = (f: File | null, kind: "image" | "video") => {
    setMedia(f ? { file: f, kind } : null);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
  };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const canSubmit = (message.trim().length > 0 || !!media) && !mutation.isPending;

  return (
    <div onClick={() => !mutation.isPending && onClose()} className="ms-fade-up" style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,13,31,.78)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--bd)" }}>
          <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "var(--tx)" }}>Publier sur {pageName}</div>
          <button onClick={onClose} disabled={mutation.isPending} style={{ display: "inline-flex", background: "none", border: "none", color: "var(--tx-dim)", cursor: mutation.isPending ? "default" : "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Qu'avez-vous en tête ?"
            rows={5}
            autoFocus
            style={{ width: "100%", resize: "vertical", background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 10, padding: "12px 14px", color: "var(--tx-bright)", fontSize: 14, fontFamily: "IBM Plex Sans", lineHeight: 1.5, outline: "none" }}
          />
          {preview && media && (
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--bd)" }}>
              {media.kind === "video"
                ? <video src={preview} controls style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block", background: "#000" }} />
                : <img src={preview} alt="" style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }} />}
              <button onClick={() => pickMedia(null, "image")} title="Retirer le média" style={{ position: "absolute", top: 8, right: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(6,13,31,.7)", color: "#fff", cursor: "pointer" }}><X size={16} /></button>
            </div>
          )}
          {errMsg && <div style={{ fontSize: 12.5, color: "#FCA5A5", background: "#F43F5E12", border: "1px solid #F43F5E30", borderRadius: 8, padding: "9px 12px" }}>{errMsg}</div>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label title="Ajouter une photo" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "1px solid var(--bd)", background: "var(--surf-inset)", color: media?.kind === "image" ? "var(--accent)" : "var(--tx-2b)", cursor: "pointer" }}>
                <ImagePlus size={18} />
                <input type="file" accept="image/*" onChange={(e) => pickMedia(e.target.files?.[0] || null, "image")} style={{ display: "none" }} />
              </label>
              <label title="Ajouter une vidéo" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "1px solid var(--bd)", background: "var(--surf-inset)", color: media?.kind === "video" ? "var(--accent)" : "var(--tx-2b)", cursor: "pointer" }}>
                <Film size={18} />
                <input type="file" accept="video/*" onChange={(e) => pickMedia(e.target.files?.[0] || null, "video")} style={{ display: "none" }} />
              </label>
              {media && <span style={{ fontSize: 12, color: "var(--tx-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{media.file.name}</span>}
            </div>
            <button onClick={() => mutation.mutate()} disabled={!canSubmit} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none", background: canSubmit ? "var(--accent)" : "var(--bd)", color: canSubmit ? "#fff" : "var(--tx-dim)", fontSize: 13.5, fontWeight: 600, cursor: canSubmit ? "pointer" : "default" }}>
              {mutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Publication…</> : <><Send size={16} /> Publier</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
