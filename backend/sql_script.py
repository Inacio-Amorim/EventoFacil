"""Lê o database/eventofacil.sql e separa os comandos para executar via Python."""

import re
from pathlib import Path

SQL_PATH = Path(__file__).resolve().parent.parent / "database" / "eventofacil.sql"


def comandos(nome_banco=None, criar_banco=True):
    """
    nome_banco  -> troca o nome "eventofacil" por outro (ex.: banco de testes)
    criar_banco -> False ignora DROP/CREATE DATABASE e USE, para rodar dentro
                   de um banco que já existe (ex.: "defaultdb" na hospedagem)
    """
    script = SQL_PATH.read_text(encoding="utf-8")
    if nome_banco:
        script = re.sub(r"\b(DATABASE IF EXISTS|DATABASE|USE)\s+eventofacil\b",
                        rf"\1 {nome_banco}", script)
    linhas = [l for l in script.splitlines() if not l.strip().startswith("--")]
    lista = [c.strip() for c in re.split(r";\s*\n", "\n".join(linhas)) if c.strip()]
    lista = [c.rstrip(";") for c in lista]
    if not criar_banco:
        lista = [c for c in lista
                 if not re.match(r"(DROP\s+DATABASE|CREATE\s+DATABASE|USE\s)", c, re.I)]
    return lista
