"""
Inscrições em eventos (RF02, RF03, RF07).
"""

from flask import Blueprint, jsonify, request

import regras
import validacao as v
from auth_utils import erro, login_obrigatorio
from db import consultar, serializar

bp = Blueprint("inscricoes", __name__, url_prefix="/api")


def _inscricoes_do_aluno(id_aluno):
    return consultar(
        "SELECT i.id_inscricao, i.data_inscricao, i.status AS status_inscricao, "
        "       e.id_evento, e.titulo, e.data_evento, e.local, e.status AS status_evento, "
        "       e.imagem_url, c.nome AS categoria "
        "FROM inscricao i "
        "JOIN evento e ON e.id_evento = i.id_evento "
        "LEFT JOIN categoria c ON c.id_categoria = e.id_categoria "
        "WHERE i.id_aluno = %s AND i.status = 'Confirmada' "
        "ORDER BY e.data_evento",
        (id_aluno,),
    )


@bp.post("/inscricoes")
@login_obrigatorio
def criar_inscricao(aluno):
    dados = request.get_json(silent=True) or {}
    id_evento = v.inteiro_positivo(dados.get("id_evento"), "id_evento", "O evento")
    resultado = regras.inscrever(aluno["id_aluno"], id_evento)

    mensagem = "Inscrição realizada com sucesso!"
    if resultado["evento_encerrado"]:
        mensagem += " Você garantiu a última vaga: as inscrições foram encerradas."
    return jsonify({"mensagem": mensagem, **resultado}), 201


@bp.delete("/inscricoes/<int:id_evento>")
@login_obrigatorio
def cancelar_inscricao(aluno, id_evento):
    resultado = regras.cancelar_inscricao(aluno["id_aluno"], id_evento)
    return jsonify({"mensagem": "Inscrição cancelada.", **resultado})


@bp.get("/inscricoes/minhas")
@login_obrigatorio
def minhas_inscricoes(aluno):
    return jsonify(serializar(_inscricoes_do_aluno(aluno["id_aluno"])))


@bp.get("/inscricoes/aluno/<int:id_aluno>")
@login_obrigatorio
def inscricoes_por_aluno(aluno, id_aluno):
    # LGPD: cada aluno só consulta as próprias inscrições
    if id_aluno != aluno["id_aluno"]:
        return erro("Você só pode consultar as suas próprias inscrições.", 403)
    return jsonify(serializar(_inscricoes_do_aluno(id_aluno)))
