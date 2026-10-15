"""
Configuração dos testes automatizados (pytest).

Os testes usam um banco separado (eventofacil_test), recriado a partir
de database/eventofacil.sql antes de CADA teste. Assim o banco de
desenvolvimento nunca é tocado.

Variáveis de ambiente (ou backend/.env):
    DB_HOST, DB_PORT, DB_USER, DB_PASSWORD  -> mesmas do backend
    TEST_DB_NAME                            -> padrão: eventofacil_test
"""

import os
import re
import sys
from pathlib import Path

import pymysql
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from config import Config  # noqa: E402
from services import email_service  # noqa: E402

SQL_PATH = BACKEND_DIR.parent / "database" / "eventofacil.sql"
TEST_DB = os.getenv("TEST_DB_NAME", "eventofacil_test")


def _comandos_sql(nome_banco):
    script = SQL_PATH.read_text(encoding="utf-8")
    script = re.sub(r"\b(DATABASE IF EXISTS|DATABASE|USE)\s+eventofacil\b",
                    rf"\1 {nome_banco}", script)
    linhas = [l for l in script.splitlines() if not l.strip().startswith("--")]
    return [c.strip() for c in re.split(r";\s*\n", "\n".join(linhas)) if c.strip()]


COMANDOS = _comandos_sql(TEST_DB)


def recriar_banco():
    conn = pymysql.connect(
        host=Config.DB_HOST, port=Config.DB_PORT, user=Config.DB_USER,
        password=Config.DB_PASSWORD, charset="utf8mb4", autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            for comando in COMANDOS:
                cur.execute(comando.rstrip(";"))
    finally:
        conn.close()


@pytest.fixture
def codigos_enviados(monkeypatch):
    """Captura os códigos que seriam enviados por e-mail."""
    enviados = []

    def falso_envio(destinatario, nome, codigo, tipo):
        enviados.append({"email": destinatario, "codigo": codigo, "tipo": tipo})

    monkeypatch.setattr(email_service, "enviar_codigo", falso_envio)
    return enviados


@pytest.fixture
def app(codigos_enviados):
    recriar_banco()
    aplicacao = create_app({
        "TESTING": True,
        "DB_NAME": TEST_DB,
        "SECRET_KEY": "chave-de-teste",
        "ADMIN_SENHA": "coord-teste",
        "AZURE_ENDPOINT": "",
        "AZURE_API_KEY": "",
        "ASSISTENTE_LIMITE_POR_MINUTO": 1000,
    })
    yield aplicacao


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def novo_client(app):
    """Cria clientes extras (outros navegadores/alunos)."""
    return app.test_client


def login(client, email="joao.teste@email.com", senha="Teste@123"):
    r = client.post("/api/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["aluno"]


def cadastrar_e_confirmar(client, codigos, nome="Ana Souza", email="ana@email.com", ra="RA2026100"):
    r = client.post("/api/auth/cadastro",
                    json={"nome": nome, "email": email, "ra": ra, "senha": "segredo1"})
    assert r.status_code == 201, r.get_json()
    codigo = [c for c in codigos if c["email"] == email][-1]["codigo"]
    r = client.post("/api/auth/confirmar-email", json={"email": email, "codigo": codigo})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["aluno"]


def id_evento(client, titulo):
    eventos = client.get("/api/eventos").get_json()
    return next(e["id_evento"] for e in eventos if e["titulo"] == titulo)
