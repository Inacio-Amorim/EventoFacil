"""
Assistente virtual de IA (RF04, RF05, RF06, RN05).

O front envia a pergunta para POST /api/assistente/perguntar.
O backend junta a pergunta com o catálogo ATUAL do banco (eventos,
datas, locais e vagas) e chama o agente do Azure AI Foundry com a
chave guardada no .env. A chave nunca chega ao navegador (RNF05).
"""

import time
from collections import defaultdict, deque
from datetime import datetime
from threading import Lock

from flask import Blueprint, current_app, jsonify, request

from auth_utils import aluno_logado, erro
from db import consultar
from routes.eventos import listar_eventos_visiveis
from services import ia_service

bp = Blueprint("assistente", __name__, url_prefix="/api/assistente")

DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
               "sexta-feira", "sábado", "domingo"]

_historico_ip = defaultdict(deque)
_trava = Lock()


def _excedeu_limite(ip):
    limite = current_app.config["ASSISTENTE_LIMITE_POR_MINUTO"]
    agora = time.time()
    with _trava:
        fila = _historico_ip[ip]
        while fila and agora - fila[0] > 60:
            fila.popleft()
        if len(fila) >= limite:
            return True
        fila.append(agora)
        return False


def _formatar_data(data):
    return f"{data:%d/%m/%Y} ({DIAS_SEMANA[data.weekday()]}) às {data:%H:%M}"


def montar_contexto(eventos, aluno=None):
    """Texto com os dados reais do sistema, enviado junto com a pergunta.
    LGPD: do aluno vai apenas o primeiro nome e as inscrições (nada de
    e-mail ou RA)."""
    agora = datetime.now()
    linhas = [
        f"[CONTEXTO DO SISTEMA EVENTOFÁCIL - atualizado em {agora:%d/%m/%Y %H:%M}]",
        "Use somente estes dados para responder sobre eventos. "
        "Ao citar um evento, escreva o título exatamente como aparece abaixo. "
        "Para se inscrever, o aluno clica no evento na lista ou no botão que "
        "aparece abaixo da sua resposta.",
        "",
        "Catálogo de eventos:",
    ]
    if not eventos:
        linhas.append("- Nenhum evento disponível no momento.")
    for e in eventos:
        if e["status"] == "Inscrições Abertas":
            vagas = f"{e['vagas_disponiveis']} de {e['vagas_totais']} vagas disponíveis"
        else:
            vagas = "sem vagas (inscrições encerradas)" if e["status"] == "Inscrições Encerradas" else e["status"]
        linhas.append(
            f"- {e['titulo']} | Categoria: {e['categoria']} | "
            f"{_formatar_data(e['data_evento'])} | Local: {e['local']} | "
            f"{vagas} | Situação: {e['status']} | {e['descricao'] or ''}"
        )

    if aluno:
        inscricoes = consultar(
            "SELECT e.titulo FROM inscricao i JOIN evento e ON e.id_evento = i.id_evento "
            "WHERE i.id_aluno = %s AND i.status = 'Confirmada' ORDER BY e.data_evento",
            (aluno["id_aluno"],),
        )
        titulos = "; ".join(i["titulo"] for i in inscricoes) or "nenhuma inscrição"
        linhas += ["", f"Aluno conectado: {aluno['nome'].split(' ')[0]}. Inscrições atuais: {titulos}."]

    linhas.append("[FIM DO CONTEXTO]")
    return "\n".join(linhas)


def eventos_citados(resposta, eventos):
    texto = (resposta or "").lower()
    return [e["id_evento"] for e in eventos if e["titulo"].lower() in texto]


@bp.get("/status")
def status():
    return jsonify({"configurado": ia_service.configurado()})


@bp.post("/perguntar")
def perguntar():
    dados = request.get_json(silent=True) or {}
    mensagem = (dados.get("mensagem") or "").strip()
    conversation_id = (dados.get("conversation_id") or "").strip() or None

    if not mensagem:
        return erro("Digite uma pergunta.", 400)
    if len(mensagem) > 1000:
        return erro("Pergunta muito longa (máximo 1000 caracteres).", 400)
    if not ia_service.configurado():
        return erro("O assistente ainda não foi configurado no servidor (.env).", 503)
    if _excedeu_limite(request.remote_addr or "?"):
        return erro("Muitas perguntas seguidas. Aguarde um minuto.", 429)

    eventos = listar_eventos_visiveis()
    contexto = montar_contexto(eventos, aluno_logado())
    texto = f"{contexto}\n\nPergunta do aluno: {mensagem}"

    inicio = time.time()
    try:
        resposta, conversation_id = ia_service.perguntar(texto, conversation_id)
    except ia_service.ErroIA as e:
        current_app.logger.error("Falha no Azure AI Foundry: %s", e)
        return erro("O assistente não conseguiu responder agora. Tente novamente.", 502)

    return jsonify({
        "resposta": resposta,
        "conversation_id": conversation_id,
        "eventos_citados": eventos_citados(resposta, eventos),
        "tempo_segundos": round(time.time() - inicio, 2),
    })
