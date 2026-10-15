"""
Rotas públicas de eventos e categorias (RF01).
"""

from flask import Blueprint, jsonify, request, session

from auth_utils import erro
from db import consultar, serializar
from regras import STATUS_VISIVEIS_ALUNO

bp = Blueprint("eventos", __name__, url_prefix="/api")

CAMPOS_EVENTO = (
    "id_evento, titulo, descricao, data_evento, local, vagas_totais, status, "
    "imagem_url, id_categoria, categoria, inscritos, vagas_disponiveis"
)


def ids_inscritos_do_aluno():
    id_aluno = session.get("id_aluno")
    if not id_aluno:
        return set()
    linhas = consultar(
        "SELECT id_evento FROM inscricao WHERE id_aluno = %s AND status = 'Confirmada'",
        (id_aluno,),
    )
    return {linha["id_evento"] for linha in linhas}


def listar_eventos_visiveis(categoria=None, busca=None):
    marcadores = ", ".join(["%s"] * len(STATUS_VISIVEIS_ALUNO))
    sql = f"SELECT {CAMPOS_EVENTO} FROM vw_evento_vagas WHERE status IN ({marcadores})"
    params = list(STATUS_VISIVEIS_ALUNO)

    if categoria and categoria != "Todos":
        sql += " AND categoria = %s"
        params.append(categoria)

    if busca:
        sql += " AND (titulo LIKE %s OR descricao LIKE %s OR categoria LIKE %s)"
        termo = f"%{busca}%"
        params += [termo, termo, termo]

    sql += " ORDER BY data_evento"
    return consultar(sql, params)


@bp.get("/categorias")
def listar_categorias():
    categorias = consultar("SELECT id_categoria, nome FROM categoria ORDER BY nome")
    return jsonify(categorias)


@bp.get("/eventos")
def listar_eventos():
    eventos = listar_eventos_visiveis(
        categoria=request.args.get("categoria", "").strip(),
        busca=request.args.get("busca", "").strip(),
    )
    inscritos = ids_inscritos_do_aluno()
    for evento in eventos:
        evento["inscrito"] = evento["id_evento"] in inscritos
    return jsonify(serializar(eventos))


@bp.get("/eventos/<int:id_evento>")
def detalhar_evento(id_evento):
    marcadores = ", ".join(["%s"] * len(STATUS_VISIVEIS_ALUNO))
    evento = consultar(
        f"SELECT {CAMPOS_EVENTO} FROM vw_evento_vagas "
        f"WHERE id_evento = %s AND status IN ({marcadores})",
        [id_evento, *STATUS_VISIVEIS_ALUNO],
        um=True,
    )
    if not evento:
        return erro("Evento não encontrado.", 404)
    evento["inscrito"] = id_evento in ids_inscritos_do_aluno()
    return jsonify(serializar(evento))
