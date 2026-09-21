/** Historique local des conversations du chat.
 *
 * Le chat parle directement à UCC (cf. `ucc.ts`), qui ne connaît qu'UNE SEULE
 * conversation active par (utilisateur, agent) — vérifié en direct : un second
 * `start-conversation` pour le même couple renvoie la MÊME room
 * (`isNew: false`), jamais une nouvelle. « New Chat » ne peut donc pas ouvrir
 * une seconde room côté UCC ; on archive l'écran courant ICI, dans le
 * navigateur, et on reparle à l'agent dans un écran vide qui rejoint la même
 * room UCC que toujours.
 *
 * Une entrée archivée est donc un instantané : elle se réaffiche telle quelle,
 * mais écrire n'est possible que sur le fil courant (celui relié à la room
 * UCC réelle).
 */

export interface ArchivedMessage {
  role: "user" | "ai";
  text: string;
  time: string;
}

export interface ArchivedConversation {
  id: string;
  title: string | null;
  created_at: string;
  agentId: string;
  messages: ArchivedMessage[];
}

const STORAGE_KEY = "metainsight.chat_history";

function readAll(): ArchivedConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    // Donnée corrompue ou navigation privée : repartir vide plutôt que planter.
    return [];
  }
}

function writeAll(list: ArchivedConversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota dépassé, storage bloqué… l'historique n'est qu'un confort d'UI.
  }
}

export function listArchived(): ArchivedConversation[] {
  // Plus récent en premier, comme l'ancienne liste de conversations backend.
  return readAll().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Archive le fil courant s'il contient au moins un message échangé (le
 *  message d'accueil seul ne mérite pas une entrée dans l'historique). */
export function archive(agentId: string, messages: ArchivedMessage[]): void {
  if (messages.length === 0) return;
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return; // écran jamais utilisé : rien à garder.

  const entry: ArchivedConversation = {
    id: `local-${Date.now()}`,
    title: firstUser.text.slice(0, 60) || null,
    created_at: new Date().toISOString(),
    agentId,
    messages,
  };
  writeAll([entry, ...readAll()]);
}
