"""Tests rate limiter sliding window Redis (roadmap #2).

Utilise fakeredis (Redis en mémoire, vrai protocole ZSET) pour exercer le VRAI
algorithme — pas un mock qui réimplémenterait la logique. Couvre : limite
appliquée, hits rejetés non comptés, isolation par user/clé, fenêtre qui se
réinitialise, et fail-open quand Redis est absent."""

import fakeredis
import pytest

from backend import ratelimit


@pytest.fixture
def fake_redis(monkeypatch):
    client = fakeredis.FakeStrictRedis(decode_responses=True)
    monkeypatch.setattr(ratelimit, "_redis", client)
    monkeypatch.setattr(ratelimit, "_degraded", False)
    return client


def test_limit_enforced(fake_redis):
    # 3 hits autorisés, le 4e dépasse la limite.
    assert ratelimit.check_rate_limit("u1", "chat", limit=3, window_s=60) is True
    assert ratelimit.check_rate_limit("u1", "chat", limit=3, window_s=60) is True
    assert ratelimit.check_rate_limit("u1", "chat", limit=3, window_s=60) is True
    assert ratelimit.check_rate_limit("u1", "chat", limit=3, window_s=60) is False


def test_rejected_hits_not_counted(fake_redis):
    # On sature, puis on tape encore : le compteur ne doit pas gonfler à cause des
    # rejets (sinon un spammeur s'auto-prolongerait le blocage indéfiniment).
    for _ in range(2):
        assert ratelimit.check_rate_limit("u1", "chat", limit=2, window_s=60) is True
    for _ in range(5):
        assert ratelimit.check_rate_limit("u1", "chat", limit=2, window_s=60) is False
    # Le sorted set contient exactement les 2 hits autorisés, pas les 5 rejets.
    assert fake_redis.zcard("rl:u1:chat") == 2


def test_isolated_per_user_and_key(fake_redis):
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=60) is True
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=60) is False
    # Autre user → compteur séparé.
    assert ratelimit.check_rate_limit("u2", "chat", limit=1, window_s=60) is True
    # Même user, autre clé → compteur séparé.
    assert ratelimit.check_rate_limit("u1", "upload", limit=1, window_s=60) is True


def test_window_resets(fake_redis, monkeypatch):
    # Horloge gelée et pilotée → test déterministe, indépendant de la latence réelle
    # des appels (fakeredis peut être lent sous Windows).
    clock = {"t": 1000.0}
    monkeypatch.setattr(ratelimit.time, "time", lambda: clock["t"])

    # Dans la fenêtre : 1er hit OK, 2e bloqué.
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=10) is True
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=10) is False
    # On avance au-delà de la fenêtre → l'ancien hit est purgé → de nouveau autorisé.
    clock["t"] += 11
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=10) is True


def test_fail_open_when_redis_down(monkeypatch):
    # Redis non initialisé → on autorise (fail-open) au lieu de crasher.
    monkeypatch.setattr(ratelimit, "_redis", None)
    monkeypatch.setattr(ratelimit, "_degraded", False)
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=60) is True
    assert ratelimit.check_rate_limit("u1", "chat", limit=1, window_s=60) is True
