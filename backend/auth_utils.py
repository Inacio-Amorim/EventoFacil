"""
Sessão do aluno e da coordenação.

A sessão fica num cookie assinado pelo Flask (HttpOnly). O front-end
não guarda senha nem token: só envia o cookie automaticamente.
"""

from functools import wraps

from flask import jsonify, session

from db import consultar


def erro(mensagem, status=400, **extra):
    return jsonify({"erro": mensagem, **extra}), status


def aluno_logado():
    id_aluno = session.get("id_aluno")
    if not id_aluno:
        return None
    return consultar(
        "SELECT id_aluno, nome, email, ra, email_confirmado, data_cadastro "
        "FROM aluno WHERE id_aluno = %s",
        (id_aluno,),
        um=True,
    )


def login_obrigatorio(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        aluno = aluno_logado()
        if not aluno:
            session.pop("id_aluno", None)
            return erro("Faça login para continuar.", 401)
        return func(aluno, *args, **kwargs)

    return wrapper


def coordenacao_obrigatoria(func):
    """RN04: só a coordenação acessa as rotas de gestão."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        if not session.get("coordenacao"):
            return erro("Acesso restrito à coordenação.", 403)
        return func(*args, **kwargs)

    return wrapper


def dados_publicos_aluno(aluno):
    return {
        "id_aluno": aluno["id_aluno"],
        "nome": aluno["nome"],
        "email": aluno["email"],
        "ra": aluno["ra"],
    }
