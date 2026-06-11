// Synchro légère état ↔ URL via la History API (aucune dépendance routeur).
// L'app navigue par state React ; ces helpers mirroir ce state dans la query
// string pour que l'URL reflète la section active + le compte sélectionné, et
// que reload / précédent-suivant du navigateur restaurent l'état.

/** Lit un paramètre de la query string courante. */
export function getUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Fusionne `patch` avec les params existants (préserve ceux qu'on ne touche
 *  pas, supprime ceux mis à `null`) puis pousse une nouvelle entrée d'historique.
 *  Fusion indispensable : plusieurs sources (`view`, `account`) écrivent l'URL et
 *  ne doivent pas s'écraser. No-op si rien ne change (évite des entrées dupliquées). */
export function setUrlParams(patch: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  if (qs === window.location.search.replace(/^\?/, "")) return; // inchangé → pas d'entrée dupliquée
  window.history.pushState({}, "", qs ? `?${qs}` : window.location.pathname);
}

/** S'abonne aux navigations précédent/suivant du navigateur. Retourne un cleanup. */
export function onUrlChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}
