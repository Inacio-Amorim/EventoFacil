"""
Cadastro, confirmação de e-mail, login, recuperação de senha e perfil.

Fluxo do cadastro:
  1. POST /api/auth/cadastro        -> cria a conta e envia o código por e-mail
  2. POST /api/auth/confirmar-email -> confere o código e já faz o login
O login só é liberado depois que o e-mail é confirmado.
"""

import time

import pymysql
from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import validacao as v
from auth_utils import aluno_logado, dados_publicos_aluno, erro, login_obrigatorio
from db import consultar, get_db
from regras import ErroRegra
from services import codigos

bp = Blueprint("auth", __name__, url_prefix="/api")

REAUTENTICACAO_SEGUNDOS = 5 * 60
RECUPERACAO_SEGUNDOS = 10 * 60


def _buscar_por_email(email):
    return consultar(
        "SELECT id_aluno, nome, email, ra, senha_hash, email_confirmado "
        "FROM aluno WHERE email = %s",
        (email,),
        um=True,
    )


def _iniciar_sessao(aluno):
    session.clear()
    session.permanent = True
    session["id_aluno"] = aluno["id_aluno"]


# ------------------------------------------------------------------
# Cadastro e confirmação
# ------------------------------------------------------------------
@bp.post("/auth/cadastro")
def cadastro():
    dados = request.get_json(silent=True) or {}
    nome = v.nome_completo(dados.get("nome"))
    email = v.email(dados.get("email"))
    ra = v.ra(dados.get("ra"))
    senha = v.senha(dados.get("senha"))

    existente = _buscar_por_email(email)
    if existente and existente["email_confirmado"]:
        raise v.ErroCampo("email", "Este e-mail já possui uma conta.")

    dono_ra = consultar("SELECT id_aluno FROM aluno WHERE ra = %s", (ra,), um=True)
    if dono_ra and (not existente or dono_ra["id_aluno"] != existente["id_aluno"]):
        raise v.ErroCampo("ra", "Este RA já está cadastrado.")

    db = get_db()
    senha_hash = generate_password_hash(senha)
    try:
        with db.cursor() as cur:
            if existente:
                # Cadastro iniciado antes e não confirmado: atualiza os dados
                cur.execute(
                    "UPDATE aluno SET nome = %s, ra = %s, senha_hash = %s "
                    "WHERE id_aluno = %s",
                    (nome, ra, senha_hash, existente["id_aluno"]),
                )
                id_aluno = existente["id_aluno"]
            else:
                cur.execute(
                    "INSERT INTO aluno (nome, email, ra, senha_hash) "
                    "VALUES (%s, %s, %s, %s)",
                    (nome, email, ra, senha_hash),
                )
                id_aluno = cur.lastrowid
        db.commit()
    except pymysql.err.IntegrityError:
        db.rollback()
        raise ErroRegra(409, "E-mail ou RA já cadastrado.")

    aluno = {"id_aluno": id_aluno, "nome": nome, "email": email}
    try:
        validade = codigos.gerar_e_enviar(aluno, codigos.CONFIRMACAO)
    except ErroRegra as e:
        if e.status_http != 429:
            raise
        validade = current_app.config["CODIGO_VALIDADE_MINUTOS"] * 60

    return jsonify({
        "mensagem": "Conta criada! Enviamos um código de confirmação para o seu e-mail.",
        "email": email,
        "expira_em_segundos": validade,
    }), 201


@bp.post("/auth/confirmar-email")
def confirmar_email():
    dados = request.get_json(silent=True) or {}
    email = v.email(dados.get("email"))
    aluno = _buscar_por_email(email)
    if not aluno:
        return erro("Conta não encontrada.", 404)

    if not aluno["email_confirmado"]:
        codigos.validar(aluno["id_aluno"], codigos.CONFIRMACAO, dados.get("codigo"))
        db = get_db()
        with db.cursor() as cur:
            cur.execute(
                "UPDATE aluno SET email_confirmado = TRUE WHERE id_aluno = %s",
                (aluno["id_aluno"],),
            )
        db.commit()

    _iniciar_sessao(aluno)
    return jsonify({"mensagem": "E-mail confirmado!", "aluno": dados_publicos_aluno(aluno)})


@bp.post("/auth/reenviar-codigo")
def reenviar_codigo():
    dados = request.get_json(silent=True) or {}
    email = v.email(dados.get("email"))
    aluno = _buscar_por_email(email)
    if not aluno:
        return erro("Conta não encontrada.", 404)
    if aluno["email_confirmado"]:
        return erro("Este e-mail já foi confirmado. Faça login.", 409)
    validade = codigos.gerar_e_enviar(aluno, codigos.CONFIRMACAO)
    return jsonify({"mensagem": "Novo código enviado.", "expira_em_segundos": validade})


# ------------------------------------------------------------------
# Login / logout / sessão
# ------------------------------------------------------------------
@bp.post("/auth/login")
def login():
    dados = request.get_json(silent=True) or {}
    email = v.email(dados.get("email"))
    senha = dados.get("senha") or ""
    if not senha:
        raise v.ErroCampo("senha", "Digite sua senha.")

    aluno = _buscar_por_email(email)
    if not aluno:
        raise v.ErroCampo("email", "E-mail não encontrado.")
    if not check_password_hash(aluno["senha_hash"], senha):
        raise v.ErroCampo("senha", "Senha incorreta.")

    if not aluno["email_confirmado"]:
        validade = current_app.config["CODIGO_VALIDADE_MINUTOS"] * 60
        try:
            validade = codigos.gerar_e_enviar(aluno, codigos.CONFIRMACAO)
        except ErroRegra:
            pass
        return erro(
            "Confirme seu e-mail para entrar. Enviamos um novo código.",
            403,
            codigo="EMAIL_NAO_CONFIRMADO",
            email=email,
            expira_em_segundos=validade,
        )

    _iniciar_sessao(aluno)
    return jsonify({"aluno": dados_publicos_aluno(aluno)})


@bp.post("/auth/logout")
def logout():
    for chave in ("id_aluno", "reautenticado_ate", "recuperacao"):
        session.pop(chave, None)
    return jsonify({"mensagem": "Você saiu da sua conta."})


@bp.get("/auth/me")
def me():
    """Diz se há um aluno logado (aluno = null quando não há)."""
    aluno = aluno_logado()
    return jsonify({"aluno": dados_publicos_aluno(aluno) if aluno else None})


# ------------------------------------------------------------------
# Esqueci minha senha
# ------------------------------------------------------------------
@bp.post("/auth/recuperar-senha")
def recuperar_senha():
    dados = request.get_json(silent=True) or {}
    email = v.email(dados.get("email"))
    aluno = _buscar_por_email(email)
    if not aluno:
        raise v.ErroCampo("email", "E-mail não encontrado.")
    validade = codigos.gerar_e_enviar(aluno, codigos.RECUPERACAO)
    return jsonify({"mensagem": "Código de recuperação enviado.", "expira_em_segundos": validade})


@bp.post("/auth/recuperar-senha/verificar")
def verificar_codigo_recuperacao():
    dados = request.get_json(silent=True) or {}
    email = v.email(dados.get("email"))
    aluno = _buscar_por_email(email)
    if not aluno:
        return erro("Conta não encontrada.", 404)
    codigos.validar(aluno["id_aluno"], codigos.RECUPERACAO, dados.get("codigo"))
    session["recuperacao"] = {
        "id_aluno": aluno["id_aluno"],
        "ate": time.time() + RECUPERACAO_SEGUNDOS,
    }
    return jsonify({"mensagem": "Código confirmado. Defina a nova senha."})


@bp.post("/auth/recuperar-senha/redefinir")
def redefinir_senha():
    dados = request.get_json(silent=True) or {}
    recuperacao = session.get("recuperacao")
    if not recuperacao or recuperacao.get("ate", 0) < time.time():
        session.pop("recuperacao", None)
        return erro("Sessão de recuperação expirada. Peça um novo código.", 400)

    senha = v.senha(dados.get("senha"))
    db = get_db()
    with db.cursor() as cur:
        # Quem recebeu o código no e-mail comprovou que o e-mail é dele
        cur.execute(
            "UPDATE aluno SET senha_hash = %s, email_confirmado = TRUE WHERE id_aluno = %s",
            (generate_password_hash(senha), recuperacao["id_aluno"]),
        )
    db.commit()
    session.pop("recuperacao", None)
    return jsonify({"mensagem": "Senha alterada. Faça login novamente."})


# ------------------------------------------------------------------
# Perfil (exige confirmar a senha atual antes de alterar)
# ------------------------------------------------------------------
@bp.post("/perfil/reautenticar")
@login_obrigatorio
def reautenticar(aluno):
    dados = request.get_json(silent=True) or {}
    registro = _buscar_por_email(aluno["email"])
    if not check_password_hash(registro["senha_hash"], dados.get("senha") or ""):
        raise v.ErroCampo("senha", "Senha incorreta.")
    session["reautenticado_ate"] = time.time() + REAUTENTICACAO_SEGUNDOS
    return jsonify({"mensagem": "Identidade confirmada."})


@bp.patch("/perfil")
@login_obrigatorio
def atualizar_perfil(aluno):
    if session.get("reautenticado_ate", 0) < time.time():
        return erro("Confirme sua senha novamente para alterar o perfil.", 403,
                    codigo="REAUTENTICACAO_NECESSARIA")

    dados = request.get_json(silent=True) or {}
    campo = dados.get("campo")
    valor = dados.get("valor")
    db = get_db()

    try:
        with db.cursor() as cur:
            if campo == "nome":
                novo = v.nome_completo(valor, campo="valor")
                cur.execute("UPDATE aluno SET nome = %s WHERE id_aluno = %s",
                            (novo, aluno["id_aluno"]))
            elif campo == "email":
                novo = v.email(valor, campo="valor")
                cur.execute("SELECT 1 FROM aluno WHERE email = %s AND id_aluno <> %s",
                            (novo, aluno["id_aluno"]))
                if cur.fetchone():
                    raise v.ErroCampo("valor", "Este e-mail já está cadastrado.")
                cur.execute("UPDATE aluno SET email = %s WHERE id_aluno = %s",
                            (novo, aluno["id_aluno"]))
            elif campo == "senha":
                novo = v.senha(valor, campo="valor")
                cur.execute("UPDATE aluno SET senha_hash = %s WHERE id_aluno = %s",
                            (generate_password_hash(novo), aluno["id_aluno"]))
            else:
                return erro("Campo inválido. Use nome, email ou senha.", 400)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return jsonify({"mensagem": "Perfil atualizado.", "aluno": dados_publicos_aluno(aluno_logado())})
