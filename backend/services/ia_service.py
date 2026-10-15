"""
Chamada ao agente do Azure AI Foundry (agente-eventofacil).

Segue o mesmo modelo usado no curso (ENDPOINT + API_KEY + AGENT_NAME +
conversationId), com os valores lidos do .env:

    AZURE_ENDPOINT     -> "Ponto de extremidade do PROJETO"
                          https://<recurso>.services.ai.azure.com/api/projects/<projeto>
    AZURE_API_KEY      -> "Chave de API"
    AZURE_AGENT_NAME   -> nome do agente (agente-eventofacil)
    AZURE_API_VERSION  -> versão da API (padrão: 2025-11-15-preview)

Formato validado no recurso do projeto em 14/10/2026:
    POST {ENDPOINT}/openai/conversations?api-version=...           -> cria a conversa
    POST {ENDPOINT}/openai/responses?api-version=...               -> envia a mensagem
         corpo: {"agent": {"name": ..., "type": "agent_reference"},
                 "conversation": <id>, "input": [...]}
    Cabeçalho: api-key: <chave>

O conversation_id é devolvido ao front-end, que o envia de volta na
próxima pergunta para o agente lembrar do que já foi conversado.
"""

import requests
from flask import current_app


class ErroIA(Exception):
    pass


def configurado():
    cfg = current_app.config
    return bool(cfg["AZURE_ENDPOINT"] and cfg["AZURE_API_KEY"] and cfg["AZURE_AGENT_NAME"])


def _url_base():
    """Aceita o endpoint do projeto com ou sem /openai no final."""
    endpoint = current_app.config["AZURE_ENDPOINT"].rstrip("/")
    if endpoint.endswith("/openai/v1"):
        endpoint = endpoint[: -len("/v1")]
    if not endpoint.endswith("/openai"):
        endpoint += "/openai"
    return endpoint


def _post(caminho, corpo):
    cfg = current_app.config
    url = f"{_url_base()}{caminho}"
    try:
        resposta = requests.post(
            url,
            params={"api-version": cfg["AZURE_API_VERSION"]},
            json=corpo,
            headers={"api-key": cfg["AZURE_API_KEY"], "Content-Type": "application/json"},
            timeout=cfg["AZURE_TIMEOUT_SEGUNDOS"],
        )
    except requests.RequestException as e:
        raise ErroIA(f"Falha de conexão com {url}: {e}") from e
    return resposta


def _json_ou_erro(resposta):
    if resposta.status_code >= 400:
        raise ErroIA(f"HTTP {resposta.status_code} em {resposta.url}: {resposta.text[:500]}")
    return resposta.json()


def criar_conversa():
    return _json_ou_erro(_post("/conversations", {}))["id"]


def extrair_texto(dados):
    """Junta os trechos de texto da resposta (formato da Responses API)."""
    if dados.get("output_text"):
        return dados["output_text"]
    partes = []
    for item in dados.get("output", []):
        if item.get("type") == "message":
            for conteudo in item.get("content", []) or []:
                if conteudo.get("type") in ("output_text", "text"):
                    partes.append(conteudo.get("text", ""))
    texto = "\n".join(p for p in partes if p).strip()
    if not texto:
        raise ErroIA(f"Resposta sem texto: {str(dados)[:500]}")
    return texto


def perguntar(texto, conversation_id=None):
    """Envia a mensagem ao agente e devolve (resposta, conversation_id)."""
    if not conversation_id:
        conversation_id = criar_conversa()

    agente = {"name": current_app.config["AZURE_AGENT_NAME"], "type": "agent_reference"}
    corpo = {
        "agent": agente,
        "conversation": conversation_id,
        "input": [{"role": "user", "content": texto}],
    }
    resposta = _post("/responses", corpo)

    # Versões mais novas da API trocaram "agent" por "agent_reference".
    # Se o Azure reclamar, tenta de novo no formato novo.
    if resposta.status_code == 400 and "agent_reference" in resposta.text:
        corpo.pop("agent")
        corpo["agent_reference"] = agente
        resposta = _post("/responses", corpo)

    return extrair_texto(_json_ou_erro(resposta)), conversation_id
