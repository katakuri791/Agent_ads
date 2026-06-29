import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./api";
import { setToken, setRefreshToken, getToken } from "./auth";

/** Réponse type fetch minimale pour les mocks. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("intercepteur 401 → refresh → retry (roadmap #1)", () => {
  it("renouvelle l'access token et rejoue la requête d'origine", async () => {
    setToken("expired");
    setRefreshToken("r1");

    let notifCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return jsonResponse({ access_token: "new-access", refresh_token: "r2", token_type: "bearer", user: { id: "u1", email: "a@b.c" } });
      }
      if (url.includes("/notifications")) {
        notifCalls++;
        if (notifCalls === 1) return jsonResponse({ detail: "Token expired" }, 401);
        return jsonResponse({ items: [], unread_count: 0 });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await api.listNotifications();
    expect(res.unread_count).toBe(0);
    expect(notifCalls).toBe(2); // 401 puis succès après refresh
    expect(getToken()).toBe("new-access"); // token tourné
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/auth/refresh"), expect.anything());
  });

  it("déconnecte (purge les tokens) quand le refresh échoue", async () => {
    setToken("expired");
    setRefreshToken("bad");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/auth/refresh")) return jsonResponse({ detail: "Invalid refresh token" }, 401);
      if (url.includes("/notifications")) return jsonResponse({ detail: "Token expired" }, 401);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.listNotifications()).rejects.toThrow();
    expect(getToken()).toBeNull(); // session morte → logout
  });
});
