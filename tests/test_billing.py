"""Tests parsing facturation (backend/meta_pages.account_billing).

Régression : `funding_source_details.type` de Meta est parfois un ENTIER (enum),
pas une chaîne → `.replace` crashait la page Paiement (« 'int' object has no
attribute 'replace' »). On verrouille les deux cas + le fallback display_string.
"""

from backend import meta_pages


class _Resp:
    ok = True
    status_code = 200
    text = ""

    def __init__(self, payload):
        self._p = payload

    def json(self):
        return self._p


def _patch(monkeypatch, payload):
    monkeypatch.setattr(meta_pages.requests, "get", lambda *a, **k: _Resp(payload))


def test_billing_int_funding_type_does_not_crash(monkeypatch):
    _patch(monkeypatch, {
        "name": "Acct", "currency": "USD", "account_status": 1,
        "amount_spent": "12345", "balance": "0", "spend_cap": "0",
        "funding_source_details": {"type": 1, "display_string": "Visa ****1234"},
    })
    out = meta_pages.account_billing("act_1", "tok")
    # type entier → pas de libellé inventé, mais display_string préservé.
    assert out["payment_type"] is None
    assert out["payment_display"] == "Visa ****1234"
    assert out["amount_spent"] == 123.45
    assert out["account_status"] == "Actif"


def test_billing_string_funding_type_titled(monkeypatch):
    _patch(monkeypatch, {
        "currency": "EUR", "account_status": 1,
        "funding_source_details": {"type": "CREDIT_CARD", "display_string": "MC ****9"},
    })
    out = meta_pages.account_billing("act_1", "tok")
    assert out["payment_type"] == "Credit Card"
    assert out["payment_display"] == "MC ****9"


def test_billing_no_funding_source(monkeypatch):
    _patch(monkeypatch, {"currency": "USD", "account_status": 2})
    out = meta_pages.account_billing("act_1", "tok")
    assert out["payment_type"] is None
    assert out["payment_display"] is None
    assert out["account_status"] == "Désactivé"
