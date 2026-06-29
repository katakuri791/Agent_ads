"""Tests notifications in-app (roadmap #7).

Coeur critique : la déduplication anti-spam (le worker de sync tourne toutes les
20 min — sans dédup, une erreur persistante créerait une notif par passage) et le
marquage comme lu. Faux Supabase en mémoire, pas de réseau."""

import pytest

from backend import notifications


class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, table):
        self._table = table
        self._op = "select"
        self._filters = {}
        self._payload = None
        self._count = None

    def select(self, *_a, count=None):
        self._op = "select"
        self._count = count
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self._op == "insert":
            row = dict(self._payload)
            row.setdefault("read", False)
            row.setdefault("id", f"n{len(self._table) + 1}")
            self._table.append(row)
            return _Result([row])
        matched = [r for r in self._table if all(r.get(k) == v for k, v in self._filters.items())]
        if self._op == "update":
            for r in matched:
                r.update(self._payload)
            return _Result(matched)
        return _Result(matched, count=len(matched) if self._count else None)


class _FakeSupabase:
    def __init__(self):
        self.rows: list = []

    def table(self, _name):
        return _Query(self.rows)


@pytest.fixture
def fake(monkeypatch):
    fk = _FakeSupabase()
    monkeypatch.setattr(notifications, "supabase_admin", fk)
    return fk


def test_create_notification_inserts(fake):
    row = notifications.create_notification("u1", "campaign_failed", "Échec", "détail")
    assert row is not None
    assert len(fake.rows) == 1
    assert fake.rows[0]["type"] == "campaign_failed"


def test_dedup_skips_when_unread_exists(fake):
    notifications.create_notification("u1", "sync_error", "Échec sync", dedup=True)
    # 2e fois, même type, non lu déjà présent → ignoré.
    res = notifications.create_notification("u1", "sync_error", "Échec sync", dedup=True)
    assert res is None
    assert len(fake.rows) == 1


def test_dedup_allows_after_read(fake):
    notifications.create_notification("u1", "sync_error", "Échec sync", dedup=True)
    notifications.mark_all_read("u1")
    # Plus de non-lu → on peut recréer.
    res = notifications.create_notification("u1", "sync_error", "Échec sync", dedup=True)
    assert res is not None
    assert len(fake.rows) == 2


def test_dedup_per_type(fake):
    notifications.create_notification("u1", "sync_error", "A", dedup=True)
    # Type différent → non dédupliqué.
    notifications.create_notification("u1", "token_expired", "B", dedup=True)
    assert len(fake.rows) == 2


def test_mark_read(fake):
    notifications.create_notification("u1", "sync_error", "A")
    nid = fake.rows[0]["id"]
    notifications.mark_read("u1", nid)
    assert fake.rows[0]["read"] is True


def test_mark_all_read(fake):
    notifications.create_notification("u1", "sync_error", "A")
    notifications.create_notification("u1", "campaign_failed", "B")
    notifications.mark_all_read("u1")
    assert all(r["read"] for r in fake.rows)
