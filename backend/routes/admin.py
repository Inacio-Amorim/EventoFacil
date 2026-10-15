"""
Área da coordenação (RF08 / RN04).

Acesso protegido pela senha da coordenação definida em ADMIN_SENHA
no arquivo .env.
"""

import hmac

import pymysql
from flask import Blueprint, current_app, jsonify, request, session

import regras
import validacao as v
from auth_utils import coordenacao_obrigatoria, erro
from db import consultar, get_db, serializar

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp.post("/login")
def login_coordenacao():
    senha_correta = current_app.config["ADMIN_SENHA"]
    if not senha_correta:
        return erro("Defina ADMIN_SENHA no arquivo .env do backend.", 503)

    dados = request.get_json(silent=True) or {}
    senha = dados.get("senha") or ""
    if not hmac.compare_digest(senha.encode(), senha_correta.encode()):
        raise v.ErroCampo("senha", "Senha da coordenação incorreta.")

    session["coordenacao"] = True
    return jsonify({"mensagem": "Bem-vindo(a), coordenação!"})


@bp.post("/logout")
def logout_coordenacao():
    session.pop("coordenacao", None)
    return jsonify({"mensagem": "Sessão da coordenação encerrada."})


@bp.get("/sessao")
def sessao_coordenacao():
    return jsonify({"coordenacao": bool(session.get("coordenacao"))})


@bp.get("/status")
@coordenacao_obrigatoria
def listar_status():
    return jsonify({
        "status": regras.STATUS_EVENTO,
        "transicoes": {k: sorted(val) for k, val in regras.TRANSICOES.items()},
    })


# ------------------------------------------------------------------
# Eventos
# ------------------------------------------------------------------
def _dados_evento(dados):
    titulo = v.texto(dados, "titulo", maximo=150, rotulo="título")
    descricao = v.texto(dados, "descricao", obrigatorio=False, maximo=5000, rotulo="descrição")
    data_evento = v.data_hora(dados.get("data_evento"))
    local = v.texto(dados, "local", maximo=150, rotulo="local")
    vagas = v.inteiro_positivo(dados.get("vagas_totais"), "vagas_totais", "Total de vagas")
    id_categoria = v.inteiro_positivo(dados.get("id_categoria"), "id_categoria", "Categoria")
    imagem_url = v.texto(dados, "imagem_url", obrigatorio=False, maximo=500, rotulo="imagem")

    if imagem_url and not imagem_url.startswith(("http://", "https://")):
        raise v.ErroCampo("imagem_url", "A imagem deve ser um link http(s).")
    if not consultar("SELECT 1 FROM categoria WHERE id_categoria = %s", (id_categoria,), um=True):
        raise v.ErroCampo("id_categoria", "Categoria não encontrada.")

    return {
        "titulo": titulo,
        "descricao": descricao or None,
        "data_evento": data_evento,
        "local": local,
        "vagas_totais": vagas,
        "id_categoria": id_categoria,
        "imagem_url": imagem_url or None,
    }


@bp.get("/eventos")
@coordenacao_obrigatoria
def listar_todos_eventos():
    eventos = consultar("SELECT * FROM vw_evento_vagas ORDER BY data_evento DESC")
    return jsonify(serializar(eventos))


@bp.post("/eventos")
@coordenacao_obrigatoria
def criar_evento():
    dados = request.get_json(silent=True) or {}
    evento = _dados_evento(dados)
    status = dados.get("status") or regras.PLANEJADO
    if status not in (regras.PLANEJADO, regras.ABERTAS):
        raise v.ErroCampo("status", "Um evento novo começa como Planejado ou Inscrições Abertas.")

    db = get_db()
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO evento (titulo, descricao, data_evento, local, vagas_totais, "
            "id_categoria, status, imagem_url) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (evento["titulo"], evento["descricao"], evento["data_evento"], evento["local"],
             evento["vagas_totais"], evento["id_categoria"], status, evento["imagem_url"]),
        )
        novo_id = cur.lastrowid
    db.commit()
    return jsonify({"mensagem": "Evento criado.", "id_evento": novo_id}), 201


@bp.put("/eventos/<int:id_evento>")
@coordenacao_obrigatoria
def editar_evento(id_evento):
    dados = request.get_json(silent=True) or {}
    evento = _dados_evento(dados)
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute("SELECT status FROM evento WHERE id_evento = %s FOR UPDATE", (id_evento,))
            atual = cur.fetchone()
            if not atual:
                raise regras.ErroRegra(404, "Evento não encontrado.")
            if atual["status"] in (regras.CONCLUIDO, regras.CANCELADO):
                raise regras.ErroRegra(409, f"Evento {atual['status'].lower()} não pode ser editado.")

            cur.execute(
                "SELECT COUNT(*) AS total FROM inscricao "
                "WHERE id_evento = %s AND status = 'Confirmada'",
                (id_evento,),
            )
            inscritos = cur.fetchone()["total"]
            if evento["vagas_totais"] < inscritos:
                raise v.ErroCampo(
                    "vagas_totais",
                    f"O evento já tem {inscritos} inscritos: o total de vagas não pode ser menor.",
                )

            cur.execute(
                "UPDATE evento SET titulo = %s, descricao = %s, data_evento = %s, local = %s, "
                "vagas_totais = %s, id_categoria = %s, imagem_url = %s WHERE id_evento = %s",
                (evento["titulo"], evento["descricao"], evento["data_evento"], evento["local"],
                 evento["vagas_totais"], evento["id_categoria"], evento["imagem_url"], id_evento),
            )
            regras.ajustar_status_por_lotacao(cur, id_evento)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return jsonify({"mensagem": "Evento atualizado."})


@bp.patch("/eventos/<int:id_evento>/status")
@coordenacao_obrigatoria
def mudar_status(id_evento):
    dados = request.get_json(silent=True) or {}
    resultado = regras.alterar_status_evento(id_evento, dados.get("status"))
    return jsonify({"mensagem": f"Status alterado para {resultado['status']}.", **resultado})


@bp.delete("/eventos/<int:id_evento>")
@coordenacao_obrigatoria
def cancelar_evento(id_evento):
    resultado = regras.alterar_status_evento(id_evento, regras.CANCELADO)
    return jsonify({"mensagem": "Evento cancelado.", **resultado})


@bp.get("/eventos/<int:id_evento>/inscritos")
@coordenacao_obrigatoria
def listar_inscritos(id_evento):
    inscritos = consultar(
        "SELECT a.nome, a.email, a.ra, i.data_inscricao "
        "FROM inscricao i JOIN aluno a ON a.id_aluno = i.id_aluno "
        "WHERE i.id_evento = %s AND i.status = 'Confirmada' ORDER BY i.data_inscricao",
        (id_evento,),
    )
    return jsonify(serializar(inscritos))


# ------------------------------------------------------------------
# Categorias
# ------------------------------------------------------------------
@bp.post("/categorias")
@coordenacao_obrigatoria
def criar_categoria():
    dados = request.get_json(silent=True) or {}
    nome = v.texto(dados, "nome", maximo=80, rotulo="nome da categoria")
    db = get_db()
    try:
        with db.cursor() as cur:
            cur.execute("INSERT INTO categoria (nome) VALUES (%s)", (nome,))
            novo_id = cur.lastrowid
        db.commit()
    except pymysql.err.IntegrityError:
        db.rollback()
        raise v.ErroCampo("nome", "Esta categoria já existe.")
    return jsonify({"mensagem": "Categoria criada.", "id_categoria": novo_id}), 201
