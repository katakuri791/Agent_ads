import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken, getRefreshToken, setRefreshToken } from "./auth";

beforeEach(() => localStorage.clear());

describe("stockage des tokens", () => {
  it("écrit et relit l'access token", () => {
    setToken("access-abc");
    expect(getToken()).toBe("access-abc");
  });

  it("écrit et relit le refresh token", () => {
    setRefreshToken("refresh-xyz");
    expect(getRefreshToken()).toBe("refresh-xyz");
  });

  it("clearToken purge access ET refresh (déconnexion complète)", () => {
    setToken("access-abc");
    setRefreshToken("refresh-xyz");
    clearToken();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
