/** Chat direct avec un agent UCC (« fizzy »), depuis le navigateur.
 *
 * UCC est une API webhook : le POST d'envoi ne renvoie PAS la réponse du bot.
 * Elle arrive sur Socket.IO, dans l'événement `bot-message`, une fois la room
 * rejointe. La room = l'id de conversation obtenu à la première prise de contact
 * via `start-conversation`, puis réutilisé (il est mémorisé par bot).
 *
 * Le backend n'est pas dans la boucle : il n'a rien à apporter ici et un relais
 * imposerait de tenir une connexion par utilisateur.
 */
import { io, type Socket } from "socket.io-client";

import { getClientToken } from "./auth";

const UCC_URL = "https://meta-ucc.tybot.ma";
const UCC_SEND_URL = `${UCC_URL}/ucc/v`;
const START_CONVERSATION_URL =
  "https://api.tybotflow.com/api/v1/conversations/start-conversation";
const HOST = "https://app.tybotflow.com";

/** Id de conversation par bot. La même personne garde son fil d'un passage à
 *  l'autre — sinon chaque ouverture du chat créerait une room neuve. */
const convKey = (botId: string, userId: string) => `ucc.conv.${botId}.${userId}`;

export interface UccOption {
  label: string;
  value: string;
}

export interface UccMessage {
  text: string;
  options?: UccOption[];
  imageUrl?: string;
  raw: unknown;
}

/** Ouvre (ou retrouve) la conversation avec le bot et renvoie son id = la room. */
export async function startConversation(botId: string, userId: string): Promise<string> {
  const cached = localStorage.getItem(convKey(botId, userId));
  if (cached) return cached;

  const token = getClientToken();
  const res = await fetch(START_CONVERSATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // Noms de champs imposés par l'API (vérifiés en live) : `externalUser` et
    // `bot_id` en snake_case. `botId` seul renvoie 400.
    body: JSON.stringify({ externalUser: userId, bot_id: botId, channel: "web" }),
  });
  if (!res.ok) throw new Error("start-conversation failed");

  const data = await res.json();
  const id = data?.conversationId ?? data?.conversation_id ?? data?.id;
  if (!id) throw new Error("no conversation id");

  localStorage.setItem(convKey(botId, userId), String(id));
  return String(id);
}

/** Rejoint la room et appelle `onMessage` à chaque `bot-message`.
 *  Renvoie la fonction de fermeture (à appeler au démontage). */
export function listen(room: string, onMessage: (m: UccMessage) => void): () => void {
  const socket: Socket = io(UCC_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
  });

  // ⚠️ L'événement est `join_room` et l'id doit être un NOMBRE. Tout autre nom,
  // ou l'id en chaîne, place le client dans une room arbitraire : le serveur
  // émet alors dans le vide (`[bot-message] room=… listeners=0`) et aucune
  // réponse n'arrive jamais.
  const roomId = Number(room);
  const join = () => socket.emit("join_room", roomId);
  socket.on("connect", join);
  // Après une coupure réseau, Socket.IO reconnecte mais ne rejoint pas la room
  // tout seul : sans ça, les messages suivants seraient perdus en silence.
  socket.io.on("reconnect", join);

  socket.on("bot-message", (payload: unknown) => {
    for (const msg of extractMessages(payload)) onMessage({ ...msg, raw: payload });
  });

  return () => {
    socket.off("bot-message");
    socket.disconnect();
  };
}

/** Extrait les messages (texte, options, image éventuels) d'un `bot-message`.
 *
 * Quatre formes observées, toutes tolérées :
 *  1. `{bot: {item: …}}`, où `item` est un message OU un tableau de messages
 *     typés (`text`, `single-choice`, `video`, `image`, …) — un seul
 *     `bot-message` peut donc en contenir plusieurs.
 *  2. `[{output: {message: "...", options: [{label, value}, …]}}]`.
 *  3. `{bot: {item: {type:"single-choice", text, choices:[{title, value}]}}}`
 *     — forme confirmée en live pour Fizzy (`choices`/`title`, pas
 *     `options`/`label`). `item` y est un objet unique, pas un tableau — déjà
 *     couvert par le `Array.isArray` ci-dessous.
 *  4. `{bot: {item: {type:"image", image: "https://…"}}}` — image générée
 *     (ex. bot `image-generator`), forme confirmée en live : l'URL est dans
 *     `image`, pas de texte associé.
 * On garde une entrée dès qu'elle a un texte OU une image : un `video` seul
 * n'a rien à afficher (pas encore géré), mais une image seule doit s'afficher
 * même sans légende. Forme inconnue → liste vide plutôt qu'un crash ou une
 * donnée inventée.
 */
function extractMessages(payload: unknown): Omit<UccMessage, "raw">[] {
  const botItem = (payload as { bot?: { item?: unknown } })?.bot?.item;
  const item = botItem ?? payload;
  const list = Array.isArray(item) ? item : [item];

  return list
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      // Forme 2 : le contenu réel est sous `output`.
      const src = (o.output ?? o) as Record<string, unknown>;
      const text = (src.message ?? src.text ?? src.messageText ?? "") as string;
      // `options` (forme 2, {label,value}) ou `choices` (forme 3, {title,value}).
      const rawOptions = src.options ?? src.choices;
      const options = Array.isArray(rawOptions)
        ? rawOptions
            .map((opt) => {
              const oo = (opt ?? {}) as Record<string, unknown>;
              const label = oo.label ?? oo.title ?? "";
              return { label: String(label), value: String(oo.value ?? "") };
            })
            .filter((opt) => opt.label !== "" && opt.value !== "")
        : undefined;
      // Forme 4 : uniquement quand `type` vaut "image" — un champ `image`
      // ailleurs (ex. une URL de logo dans un autre type de message) ne doit
      // pas être pris pour une image à afficher.
      const imageUrl =
        src.type === "image" && typeof src.image === "string" && src.image.trim() !== ""
          ? (src.image as string)
          : undefined;
      return { text, options, imageUrl };
    })
    .filter((m) => (typeof m.text === "string" && m.text.trim() !== "") || m.imageUrl);
}

/** Envoie un message au bot. Ne renvoie rien : la réponse arrivera sur `listen`. */
export async function sendMessage(
  botId: string,
  text: string,
  externalId: string,
): Promise<void> {
  const token = getClientToken();
  const res = await fetch(UCC_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      type: "text",
      messageText: text,
      botId,
      external_id: externalId,
      isintern: true,
      host: HOST,
      channel: "web",
    }),
  });
  if (!res.ok) throw new Error("ucc send failed");
}
