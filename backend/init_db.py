"""
Cria as tabelas e os dados de exemplo na primeira vez que o sistema sobe
num servidor (hospedagem). Se as tabelas já existem, não faz nada, então
os dados cadastrados nunca são apagados.

Uso:  python init_db.py
"""

import sys

from config import Config
from db import conectar
from sql_script import comandos


def main():
    cfg = {k: getattr(Config, k) for k in dir(Config) if k.isupper()}
    conexao = conectar(cfg)
    try:
        with conexao.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'evento'")
            if cur.fetchone():
                print(f"[init_db] Banco '{cfg['DB_NAME']}' já está pronto.")
                return
            print(f"[init_db] Criando tabelas e dados de exemplo em '{cfg['DB_NAME']}'...")
            for comando in comandos(criar_banco=False):
                cur.execute(comando)
        conexao.commit()
        print("[init_db] Pronto.")
    finally:
        conexao.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:  # noqa: BLE001
        print(f"[init_db] ERRO ao preparar o banco: {erro}", file=sys.stderr)
        sys.exit(1)
