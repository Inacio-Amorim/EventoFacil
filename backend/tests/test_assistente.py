"""RF04, RF05, RF06, RN05 - assistente de IA (Azure AI Foundry simulado)."""

import pytest

from conftest import login
from services import ia_service


@pytest.fixture
def ia_configurada(app, monkeypatch):
    app.config.update(AZURE_ENDPOINT="https://exemplo.openai.azure.com/openai/v1",
                      AZURE_API_KEY="chave-falsa", AZURE_AGENT_NAME="agente-eventofacil")
    chamadas = []

    def falso_perguntar(texto, conversation_id=None):
        chamadas.append({"texto": texto, "conversation_id": conversation_id})
        return ("Recomendo o Workshop de Python para Iniciantes e a IA Generativa na Prática.",
                conversation_id or "conv_123")

    monkeypatch.setattr(ia_service, "perguntar", falso_perguntar)
    return chamadas


def test_sem_configuracao_retorna_503(client):
    r = client.post("/api/assistente/perguntar", json={"mensagem": "Oi"})
    assert r.status_code == 503
    assert client.get("/api/assistente/status").get_json() == {"configurado": False}


def test_pergunta_envia_catalogo_do_banco(client, ia_configurada):
    r = client.post("/api/assistente/perguntar",
                    json={"mensagem": "Tenho interesse em Python e IA"})
    assert r.status_code == 200
    corpo = r.get_json()
    assert corpo["conversation_id"] == "conv_123"
    # Os dois eventos citados viram botões no chat
    assert len(corpo["eventos_citados"]) == 2

    texto = ia_configurada[0]["texto"]
    assert "Workshop de Python para Iniciantes" in texto
    assert "1 de 3 vagas disponíveis" in texto
    assert "Tenho interesse em Python e IA" in texto
    # Evento Planejado não vai para a IA
    assert "Semana Acadêmica de ADS 2026" not in texto


def test_conversa_continua_com_mesmo_id(client, ia_configurada):
    client.post("/api/assistente/perguntar", json={"mensagem": "Oi"})
    client.post("/api/assistente/perguntar", json={"mensagem": "E amanhã?", "conversation_id": "conv_123"})
    assert ia_configurada[1]["conversation_id"] == "conv_123"


def test_lgpd_nao_envia_email_nem_ra(client, ia_configurada):
    login(client)
    client.post("/api/assistente/perguntar", json={"mensagem": "Em quais eventos estou inscrito?"})
    texto = ia_configurada[0]["texto"]
    assert "Aluno conectado: João" in texto
    assert "IA Generativa na Prática; Workshop de Python para Iniciantes" in texto
    assert "joao.teste@email.com" not in texto
    assert "RA2026001" not in texto


def test_validacoes_e_limite(app, client, ia_configurada):
    assert client.post("/api/assistente/perguntar", json={"mensagem": "  "}).status_code == 400
    assert client.post("/api/assistente/perguntar", json={"mensagem": "x" * 1001}).status_code == 400

    app.config["ASSISTENTE_LIMITE_POR_MINUTO"] = 2
    from routes import assistente
    assistente._historico_ip.clear()
    codigos = [client.post("/api/assistente/perguntar", json={"mensagem": "Oi"}).status_code
               for _ in range(3)]
    assert codigos == [200, 200, 429]


def test_falha_no_azure_retorna_502(app, client, monkeypatch):
    app.config.update(AZURE_ENDPOINT="https://x", AZURE_API_KEY="k")

    def falha(texto, conversation_id=None):
        raise ia_service.ErroIA("HTTP 401")

    monkeypatch.setattr(ia_service, "perguntar", falha)
    r = client.post("/api/assistente/perguntar", json={"mensagem": "Oi"})
    assert r.status_code == 502
    assert "chave" not in r.get_json()["erro"].lower()
