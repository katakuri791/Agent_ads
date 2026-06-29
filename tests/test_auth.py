"""Tests rotation refresh token (roadmap #1).

Coeur critique et invisible à l'oeil : la rotation one-time use. Si elle bugue,
soit on déconnecte tout le monde, soit un token volé reste valide à vie. On mocke
Supabase avec un faux client en mémoire (pas de réseau, pas de vraie base)."""

from datetime import datetime, timedelta, timezone

import pytest

from backend import auth


# ─── Faux client Supabase minimal (chaînage table().select().eq().limit().execute()) ──


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table):
        self._table = table
        self._op = "select"
        self._filters = {}
        self._payload = None

    def select(self, *_a):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self._op == "insert":
            self._table.append(dict(self._payload))
            return _Result([self._payload])
        matched = [r for r in self._table if all(r.get(k) == v for k, v in self._filters.items())]
        if self._op == "delete":
            for r in matched:
                self._table.remove(r)
        return _Result(matched)


class _FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list] = {}

    def table(self, name):
        return _Query(self.tables.setdefault(name, []))


@pytest.fixture
def fake_db(monkeypatch):
    fake = _FakeSupabase()
    fake.tables["users"] = [{"id": "u1", "email": "a@b.c", "full_name": "A"}]
    fake.tables["refresh_tokens"] = []
    monkeypatch.setattr(auth, "supabase_admin", fake)
    return fake


def test_refresh_token_rotation(fake_db):
    rt = auth.create_refresh_token("u1")
    assert len(fake_db.tables["refresh_tokens"]) == 1

    access, new_rt, user = auth.rotate_refresh_token(rt)
    assert access  # nouvel access token émis
    assert new_rt and new_rt != rt  # nouveau refresh token, différent de l'ancien
    assert user.id == "u1"

    # L'ancien token est invalidé, seul le nouveau subsiste (rotation).
    tokens = [r["token"] for r in fake_db.tables["refresh_tokens"]]
    assert tokens == [new_rt]


def test_refresh_token_one_time_use(fake_db):
    rt = auth.create_refresh_token("u1")
    auth.rotate_refresh_token(rt)
    # Rejouer l'ancien token doit échouer (déjà consommé).
    with pytest.raises(Exception):
        auth.rotate_refresh_token(rt)


def test_refresh_token_expired_rejected(fake_db):
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    fake_db.tables["refresh_tokens"].append({"user_id": "u1", "token": "old", "expires_at": past})

    with pytest.raises(Exception):
        auth.rotate_refresh_token("old")

    # Même expiré, le token est supprimé (one-time use, défense anti-rejeu).
    assert fake_db.tables["refresh_tokens"] == []


def test_refresh_token_unknown_rejected(fake_db):
    with pytest.raises(Exception):
        auth.rotate_refresh_token("does-not-exist")


def test_revoke_refresh_token(fake_db):
    rt = auth.create_refresh_token("u1")
    auth.revoke_refresh_token(rt)
    assert fake_db.tables["refresh_tokens"] == []
    # Idempotent : révoquer un token déjà absent ne lève pas.
    auth.revoke_refresh_token(rt)
