"""
Formato da chamada HTTP ao Azure AI Foundry (sem acessar a internet).

Reproduz o formato que funcionou no teste real (opção C do
testar_agente.py): endpoint do projeto + /openai + api-version,
cabeçalho api-key e corpo com o agente.
"""

import pytest

from services import ia_service

ENDPOINT = "https://recurso.services.ai.azure.com/api/projects/Projeto_teste"


class RespostaFalsa:
    def __init__(self, status, dados=None, texto=""):
        self.status_code = status
        self._dados = dados or {}
        self.text = texto or str(dados)
        self.url = "https://fake"

    def json(self):
        return self._dados


@pytest.fixture
def azure(app, monkeypatch):
    app.config.update(AZURE_ENDPOINT=ENDPOINT, AZURE_API_KEY="chave-falsa",
                      AZURE_AGENT_NAME="agente-eventofacil")
    chamadas = []
    respostas = []

    def falso_post(url, params=None, json=None, headers=None, timeout=None):
        chamadas.append({"url": url, "params": params, "json": json, "headers": headers})
        return respostas.pop(0)

    monkeypatch.setattr(ia_service.requests, "post", falso_post)
    return chamadas, respostas


RESPOSTA_AGENTE = {
    "output": [
        {"type": "reasoning", "content": []},
        {"type": "message", "content": [{"type": "output_text", "text": "Olá! Posso ajudar."}]},
    ]
}


def test_formato_da_chamada(app, azure):
    chamadas, respostas = azure
    respostas += [RespostaFalsa(200, {"id": "conv_1"}), RespostaFalsa(200, RESPOSTA_AGENTE)]

    with app.app_context():
        texto, conversa = ia_service.perguntar("Oi")

    assert (texto, conversa) == ("Olá! Posso ajudar.", "conv_1")
    criar, responder = chamadas
    assert criar["url"] == f"{ENDPOINT}/openai/conversations"
    assert responder["url"] == f"{ENDPOINT}/openai/responses"
    assert responder["params"] == {"api-version": "2025-11-15-preview"}
    assert responder["headers"]["api-key"] == "chave-falsa"
    assert responder["json"]["agent"] == {"name": "agente-eventofacil", "type": "agent_reference"}
    assert responder["json"]["conversation"] == "conv_1"


def test_reaproveita_conversa(app, azure):
    chamadas, respostas = azure
    respostas.append(RespostaFalsa(200, RESPOSTA_AGENTE))
    with app.app_context():
        _, conversa = ia_service.perguntar("E amanhã?", "conv_existente")
    assert conversa == "conv_existente"
    assert len(chamadas) == 1  # não cria conversa nova


def test_aceita_endpoint_com_openai_no_final(app, azure):
    chamadas, respostas = azure
    app.config["AZURE_ENDPOINT"] = ENDPOINT + "/openai/v1/"
    respostas.append(RespostaFalsa(200, RESPOSTA_AGENTE))
    with app.app_context():
        ia_service.perguntar("Oi", "conv_1")
    assert chamadas[0]["url"] == f"{ENDPOINT}/openai/responses"


def test_formato_novo_agent_reference(app, azure):
    chamadas, respostas = azure
    respostas += [
        RespostaFalsa(400, texto="The 'agent' property is deprecated. Use 'agent_reference' instead."),
        RespostaFalsa(200, RESPOSTA_AGENTE),
    ]
    with app.app_context():
        texto, _ = ia_service.perguntar("Oi", "conv_1")
    assert texto == "Olá! Posso ajudar."
    assert "agent_reference" in chamadas[1]["json"] and "agent" not in chamadas[1]["json"]


def test_erro_http_vira_erro_ia(app, azure):
    _, respostas = azure
    respostas.append(RespostaFalsa(401, texto="Access denied due to invalid subscription key"))
    with app.app_context(), pytest.raises(ia_service.ErroIA):
        ia_service.perguntar("Oi", "conv_1")


def test_rota_ponta_a_ponta(app, client, azure):
    """Front -> /api/assistente/perguntar -> Azure (simulado) -> front."""
    chamadas, respostas = azure
    respostas += [
        RespostaFalsa(200, {"id": "conv_9"}),
        RespostaFalsa(200, {"output_text": "Recomendo o Workshop de Python para Iniciantes."}),
    ]
    r = client.post("/api/assistente/perguntar", json={"mensagem": "Gosto de Python"})
    assert r.status_code == 200
    corpo = r.get_json()
    assert corpo["conversation_id"] == "conv_9"
    assert corpo["eventos_citados"] == [7]
    assert "Workshop de Python para Iniciantes" in chamadas[1]["json"]["input"][0]["content"]
