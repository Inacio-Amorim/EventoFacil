"""
Códigos de verificação de 6 dígitos (confirmação de e-mail e
recuperação de senha).

O código é guardado no banco apenas como hash, expira em poucos
minutos e aceita no máximo CODIGO_MAX_TENTATIVAS tentativas.
"""

import secrets
from datetime import datetime, timedelta

from flask import current_app
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db
from regras import ErroRegra
from services import email_service

CONFIRMACAO = "CONFIRMACAO"
RECUPERACAO = "RECUPERACAO"

# Tempo mínimo entre dois envios para o mesmo aluno
INTERVALO_REENVIO_SEGUNDOS = 30


def gerar_e_enviar(aluno, tipo):
    """Gera um novo código, invalida os anteriores e envia por e-mail."""
    cfg = current_app.config
    db = get_db()

    with db.cursor() as cur:
        cur.execute(
            "SELECT criado_em FROM codigo_verificacao "
            "WHERE id_aluno = %s AND tipo = %s ORDER BY id_codigo DESC LIMIT 1",
            (aluno["id_aluno"], tipo),
        )
        ultimo = cur.fetchone()
        if ultimo and ultimo["criado_em"] and (
            datetime.now() - ultimo["criado_em"]
        ).total_seconds() < INTERVALO_REENVIO_SEGUNDOS:
            raise ErroRegra(429, "Aguarde alguns segundos antes de pedir um novo código.")

        codigo = f"{secrets.randbelow(1_000_000):06d}"
        expira_em = datetime.now() + timedelta(minutes=cfg["CODIGO_VALIDADE_MINUTOS"])

        cur.execute(
            "UPDATE codigo_verificacao SET usado = TRUE "
            "WHERE id_aluno = %s AND tipo = %s AND usado = FALSE",
            (aluno["id_aluno"], tipo),
        )
        cur.execute(
            "INSERT INTO codigo_verificacao (id_aluno, tipo, codigo_hash, expira_em) "
            "VALUES (%s, %s, %s, %s)",
            (aluno["id_aluno"], tipo, generate_password_hash(codigo), expira_em),
        )
    db.commit()

    try:
        email_service.enviar_codigo(aluno["email"], aluno["nome"], codigo, tipo)
    except Exception as erro:  # noqa: BLE001
        current_app.logger.error("Falha ao enviar e-mail: %s", erro)
        raise ErroRegra(
            502,
            "Não foi possível enviar o e-mail agora. Verifique a configuração "
            "de SMTP ou tente novamente.",
        )

    return cfg["CODIGO_VALIDADE_MINUTOS"] * 60


def validar(id_aluno, tipo, codigo, consumir=True):
    """Confere o código. Se consumir=True, ele não pode ser usado de novo."""
    cfg = current_app.config
    db = get_db()
    codigo = (codigo or "").strip()

    with db.cursor() as cur:
        cur.execute(
            "SELECT id_codigo, codigo_hash, expira_em, tentativas "
            "FROM codigo_verificacao "
            "WHERE id_aluno = %s AND tipo = %s AND usado = FALSE "
            "ORDER BY id_codigo DESC LIMIT 1 FOR UPDATE",
            (id_aluno, tipo),
        )
        registro = cur.fetchone()

        if not registro:
            db.rollback()
            raise ErroRegra(400, "Nenhum código ativo. Peça um novo código.")

        if registro["expira_em"] < datetime.now():
            db.rollback()
            raise ErroRegra(400, "Este código expirou. Peça um novo código.")

        if registro["tentativas"] >= cfg["CODIGO_MAX_TENTATIVAS"]:
            db.rollback()
            raise ErroRegra(429, "Muitas tentativas. Peça um novo código.")

        if not (len(codigo) == 6 and codigo.isdigit()) or not check_password_hash(
            registro["codigo_hash"], codigo
        ):
            cur.execute(
                "UPDATE codigo_verificacao SET tentativas = tentativas + 1 "
                "WHERE id_codigo = %s",
                (registro["id_codigo"],),
            )
            db.commit()
            raise ErroRegra(400, "Código incorreto.")

        if consumir:
            cur.execute(
                "UPDATE codigo_verificacao SET usado = TRUE WHERE id_codigo = %s",
                (registro["id_codigo"],),
            )
    db.commit()
