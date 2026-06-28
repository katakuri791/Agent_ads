"""Tests détection token Meta expiré (roadmap #3).

Couvre le coeur invisible à l'oeil : la classification d'erreur OAuth 190 et le
fait que `record_sync_error` marque bien le compte `token_status='expired'`.
Aucune dépendance Supabase / SDK Meta réelle (duck-typing + monkeypatch)."""

from backend import facebook_sync


class _FakeFbError(Exception):
    """Imite l'interface d'un FacebookRequestError (code/subcode) sans le SDK."""

    def __init__(self, code, subcode=None):
        super().__init__("fake meta error")
        self._code = code
        self._subcode = subcode

    def api_error_code(self):
        return self._code

    def api_error_subcode(self):
        return self._subcode


def test_classify_token_expired():
    assert facebook_sync._classify_token_error(_FakeFbError(190, 463)) == "expired"


def test_classify_password_changed():
    assert facebook_sync._classify_token_error(_FakeFbError(190, 460)) == "password_changed"


def test_classify_generic_invalid():
    # Code 190 sans sous-code connu → token invalide générique.
    assert facebook_sync._classify_token_error(_FakeFbError(190)) == "invalid"
    assert facebook_sync._classify_token_error(_FakeFbError(190, 999)) == "invalid"


def test_classify_non_token_error():
    # Une autre erreur Meta (ex. rate limit code 17) ne doit PAS être un token mort.
    assert facebook_sync._classify_token_error(_FakeFbError(17)) is None


def test_classify_plain_exception():
    # Exception générique sans api_error_code → None (pas de faux positif).
    assert facebook_sync._classify_token_error(ValueError("boom")) is None


def test_record_sync_error_flags_expired(monkeypatch):
    calls = {}
    monkeypatch.setattr(facebook_sync.db, "set_fb_sync_state", lambda *a, **k: calls.setdefault("state", (a, k)))
    monkeypatch.setattr(facebook_sync.db, "set_account_token_status", lambda *a, **k: calls.setdefault("token", (a, k)))

    account = {"id": "acc-1", "meta_ad_account_id": "act_123"}
    facebook_sync.record_sync_error(account, _FakeFbError(190, 463))

    assert "state" in calls  # l'échec est journalisé dans fb_sync_state
    assert calls["token"][0] == ("acc-1", "expired")  # compte marqué expiré


def test_record_sync_error_non_token_does_not_flag(monkeypatch):
    calls = {}
    monkeypatch.setattr(facebook_sync.db, "set_fb_sync_state", lambda *a, **k: calls.setdefault("state", True))
    monkeypatch.setattr(facebook_sync.db, "set_account_token_status", lambda *a, **k: calls.setdefault("token", True))

    account = {"id": "acc-1", "meta_ad_account_id": "act_123"}
    facebook_sync.record_sync_error(account, ValueError("réseau"))

    assert calls.get("state") is True   # erreur enregistrée
    assert "token" not in calls         # mais le token n'est PAS marqué expiré
