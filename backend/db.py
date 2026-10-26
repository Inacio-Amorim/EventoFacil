"""
Conexão com o MySQL.

Cada requisição HTTP abre uma conexão (guardada em flask.g) e ela é
fechada ao final da requisição. Todas as consultas usam parâmetros
(%s) para evitar SQL Injection.
"""

import ssl
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pymysql
import pymysql.cursors
from flask import current_app, g

BASE_DIR = Path(__file__).resolve().parent


def _fuso_local():
    """Fuso do servidor no formato do MySQL (ex.: -03:00), para que NOW() do
    banco e datetime.now() do Python usem o mesmo relógio."""
    deslocamento = datetime.now().astimezone().strftime("%z")
    return f"{deslocamento[:3]}:{deslocamento[3:]}"


def _contexto_ssl(cfg):
    if not cfg.get("DB_SSL"):
        return None
    contexto = ssl.create_default_context()
    # O Python 3.13 ficou mais rígido com certificados de autoridades privadas
    # (como as dos bancos na nuvem); o PyMySQL faz o mesmo ajuste.
    contexto.verify_flags &= ~ssl.VERIFY_X509_STRICT
    if cfg.get("DB_SSL_CA"):
        caminho = Path(cfg["DB_SSL_CA"])
        if not caminho.is_absolute():
            caminho = BASE_DIR / caminho
        contexto.load_verify_locations(cafile=str(caminho))
    return contexto


def conectar(config=None, database=True):
    cfg = config or current_app.config
    return pymysql.connect(
        host=cfg["DB_HOST"],
        port=cfg["DB_PORT"],
        user=cfg["DB_USER"],
        password=cfg["DB_PASSWORD"],
        database=cfg["DB_NAME"] if database else None,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        ssl=_contexto_ssl(cfg),
        init_command=f"SET time_zone = '{_fuso_local()}'",
    )


def get_db():
    if "db" not in g:
        g.db = conectar()
    return g.db


def fechar_db(_erro=None):
    db = g.pop("db", None)
    if db is not None:
        try:
            db.rollback()
        finally:
            db.close()


def consultar(sql, params=None, um=False):
    """Executa um SELECT e devolve lista de dicionários (ou um só)."""
    with get_db().cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchone() if um else cur.fetchall()


def serializar(valor):
    """Converte datas/decimais para tipos que o JSON entende."""
    if isinstance(valor, list):
        return [serializar(v) for v in valor]
    if isinstance(valor, dict):
        return {k: serializar(v) for k, v in valor.items()}
    if isinstance(valor, datetime):
        return valor.isoformat(timespec="minutes")
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return int(valor) if valor == valor.to_integral_value() else float(valor)
    return valor


def init_app(app):
    app.teardown_appcontext(fechar_db)
