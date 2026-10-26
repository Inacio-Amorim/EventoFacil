"""Ajustes para rodar na hospedagem: DATABASE_URL, init_db e modo demonstração."""

import pymysql
import pytest

import config
import init_db
from config import Config


def test_database_url_do_aiven(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "mysql://avnadmin:s%40nha123@mysql-abc.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED",
    )
    dados = config._banco_da_url()
    assert dados == {
        "DB_HOST": "mysql-abc.aivencloud.com",
        "DB_PORT": "12345",
        "DB_USER": "avnadmin",
        "DB_PASSWORD": "s@nha123",
        "DB_NAME": "defaultdb",
        "DB_SSL": "true",
    }
    monkeypatch.delenv("DATABASE_URL")
    assert config._banco_da_url() == {}


def test_codigo_aparece_so_no_modo_demonstracao(app, client, codigos_enviados):
    corpo = {"nome": "Ana Souza", "email": "ana@email.com", "ra": "RA2026100", "senha": "segredo1"}
    r = client.post("/api/auth/cadastro", json=corpo)
    assert "codigo_demo" not in r.get_json()

    # Passa o intervalo mínimo de 30 s entre dois envios
    with app.app_context():
        import db
        conexao = db.get_db()
        with conexao.cursor() as cur:
            cur.execute("UPDATE codigo_verificacao SET criado_em = NOW() - INTERVAL 1 MINUTE")
        conexao.commit()

    app.config.update(DEMO_MOSTRAR_CODIGO=True, SMTP_HOST="")
    r = client.post("/api/auth/login", json={"email": "ana@email.com", "senha": "segredo1"})
    assert r.status_code == 403
    assert r.get_json()["codigo_demo"] == codigos_enviados[-1]["codigo"]

    # Com SMTP configurado, o código nunca vai para a tela
    app.config.update(SMTP_HOST="smtp.gmail.com")
    r = client.post("/api/auth/recuperar-senha", json={"email": "joao.teste@email.com"})
    assert "codigo_demo" not in r.get_json()


@pytest.fixture
def banco_vazio(monkeypatch):
    nome = "eventofacil_init_test"
    conn = pymysql.connect(host=Config.DB_HOST, port=Config.DB_PORT, user=Config.DB_USER,
                           password=Config.DB_PASSWORD, autocommit=True)
    with conn.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {nome}")
        cur.execute(f"CREATE DATABASE {nome} CHARACTER SET utf8mb4")
    monkeypatch.setattr(Config, "DB_NAME", nome)
    yield nome
    with conn.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {nome}")
    conn.close()


def test_init_db_cria_uma_vez_e_preserva_dados(banco_vazio, capsys):
    init_db.main()
    assert "Criando tabelas" in capsys.readouterr().out

    conn = pymysql.connect(host=Config.DB_HOST, port=Config.DB_PORT, user=Config.DB_USER,
                           password=Config.DB_PASSWORD, database=banco_vazio, autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM evento")
        assert cur.fetchone()[0] == 8
        cur.execute("UPDATE evento SET titulo = 'Alterado' WHERE id_evento = 1")

    init_db.main()  # segunda vez: não recria nada
    assert "já está pronto" in capsys.readouterr().out
    with conn.cursor() as cur:
        cur.execute("SELECT titulo FROM evento WHERE id_evento = 1")
        assert cur.fetchone()[0] == "Alterado"
    conn.close()
