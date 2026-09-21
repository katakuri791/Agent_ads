"""Extraction des `bot_id` depuis la réponse du workspace tybotflow.

La forme exacte du JSON renvoyé par `chatbot-workspaces` n'est pas figée : ces
cas verrouillent les enveloppes tolérées et, surtout, le fait qu'une réponse
inattendue renvoie une liste vide au lieu d'inventer un agent.
"""

from backend.config import is_agent_id
from backend.schemas import BotpressChatRequest, ChatRequest
from backend.workspace import extract_agents


def test_liste_nue():
    data = [{"bot_id": "fizzy", "name": "Fizzy"}]
    assert extract_agents(data) == [{"id": "fizzy", "name": "Fizzy"}]


def test_enveloppe_data():
    data = {"data": [{"bot_id": "fizzy", "name": "Fizzy"}]}
    assert extract_agents(data) == [{"id": "fizzy", "name": "Fizzy"}]


def test_enveloppe_imbriquee_list():
    # Forme NocoDB : {"data": {"list": [...]}}
    data = {"data": {"list": [{"botId": "fizzy", "title": "Fizzy"}]}}
    assert extract_agents(data) == [{"id": "fizzy", "name": "Fizzy"}]


def test_nom_absent_retombe_sur_bot_id():
    assert extract_agents([{"bot_id": "fizzy"}]) == [{"id": "fizzy", "name": "fizzy"}]


def test_entrees_sans_bot_id_ignorees():
    data = [{"name": "Sans id"}, {"bot_id": "fizzy", "name": "Fizzy"}]
    assert extract_agents(data) == [{"id": "fizzy", "name": "Fizzy"}]


def test_doublons_dedupliques():
    data = [{"bot_id": "fizzy", "name": "Fizzy"}, {"bot_id": "fizzy", "name": "Fizzy 2"}]
    assert extract_agents(data) == [{"id": "fizzy", "name": "Fizzy"}]


def test_reponse_inattendue_renvoie_vide():
    # Aucune donnée inventée si la forme change (règle projet : données réelles).
    assert extract_agents({"unexpected": "shape"}) == []
    assert extract_agents(None) == []


def test_agents_reconnus():
    assert is_agent_id("Meta_ads")
    assert is_agent_id("fizzy")
    assert is_agent_id("FIZZY")  # casse libre : l'utilisateur tape « @Fizzy »


def test_account_id_meta_nest_pas_un_agent():
    # Le cas qui casserait tout : un bot_id « 3 » (compte Meta) doit continuer à
    # partir dans account_id, sinon les appelants Botpress existants perdent leur
    # compte. Cf. api/chat/endpoint.py::chat_botpress.
    assert not is_agent_id("3")
    assert not is_agent_id("")
    assert not is_agent_id(None)


def test_bot_id_agent_ne_remplit_pas_account_id():
    # Le repli bot_id→account_id de ChatRequest ne doit PAS s'appliquer à un
    # agent : sinon get_meta_account() chercherait un compte Meta « fizzy ».
    req = ChatRequest(message="salut", bot_id="fizzy")
    assert req.account_id is None
    assert req.bot_id == "fizzy"


def test_bot_id_compte_meta_remplit_toujours_account_id():
    # Régression : les appelants Botpress historiques envoient l'account_id dans
    # bot_id. Ce repli doit survivre au changement ci-dessus.
    req = ChatRequest(message="salut", bot_id="3")
    assert req.account_id == "3"


def test_botpress_porte_agent_et_compte_meta_separement():
    # Le frontend passe par /chat/botpress : l'agent va dans bot_id, le compte
    # Meta sélectionné dans l'UI va dans account_id. Les deux doivent coexister.
    body = BotpressChatRequest(
        type="text", text="salut", bot_id="fizzy", account_id="3",
        payload={"user_id": "u1", "channel": "web"},
    )
    assert (body.bot_id, body.account_id) == ("fizzy", "3")


def test_ucc_non_configure_message_lisible(monkeypatch):
    # UCC_SEND_URL vide (env incomplet) : on refuse proprement au lieu d'appeler
    # dans le vide. Règle projet : jamais d'erreur technique à l'écran.
    import pytest
    from fastapi import HTTPException

    from api.chat import endpoint as chat_endpoint

    monkeypatch.setattr(chat_endpoint, "UCC_SEND_URL", "")
    with pytest.raises(HTTPException) as exc:
        chat_endpoint._chat_ucc(ChatRequest(message="hi", bot_id="fizzy"), "t1", "u1", "tok")
    assert exc.value.status_code == 503
    assert "pas encore disponible" in exc.value.detail


def test_ucc_sans_token_message_lisible(monkeypatch):
    # Login local (pas de token tybotflow) : on ne peut pas parler à un agent
    # externe. Message actionnable, pas un 401 brut.
    import pytest
    from fastapi import HTTPException

    from api.chat import endpoint as chat_endpoint

    monkeypatch.setattr(chat_endpoint, "UCC_SEND_URL", "https://example.invalid/ucc")
    with pytest.raises(HTTPException) as exc:
        chat_endpoint._chat_ucc(ChatRequest(message="hi", bot_id="fizzy"), "t1", "u1", None)
    assert exc.value.status_code == 403


def test_botpress_user_id_optionnel():
    # Le frontend est déjà authentifié : s'il devait s'auto-déclarer, la clé de
    # tenant du chat divergerait de celle de /conversations et les fils créés
    # seraient invisibles dans la liste (404 sur /conversations/{id}/messages).
    body = BotpressChatRequest(
        type="text", text="salut", bot_id="Meta_ads", payload={"channel": "web"},
    )
    assert body.payload.user_id is None


def test_botpress_account_id_optionnel():
    # Botpress historique n'envoie pas account_id → compte par défaut.
    body = BotpressChatRequest(
        type="text", text="salut", bot_id="3",
        payload={"user_id": "u1", "channel": "web"},
    )
    assert body.account_id is None
