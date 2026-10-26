"""
Configurações do backend do EventoFácil.

Todas as credenciais vêm de variáveis de ambiente (arquivo .env),
nunca do código-fonte (ADR03 / RNF05).
"""

import os
import secrets
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# Carrega o arquivo backend/.env (se existir)
load_dotenv(BASE_DIR / ".env")


def _bool(valor, padrao=False):
    if valor is None or valor == "":
        return padrao
    return str(valor).strip().lower() in ("1", "true", "sim", "yes", "on")


def _banco_da_url():
    """
    Na hospedagem, o banco vem numa única variável DATABASE_URL, no formato
    mysql://usuario:senha@host:porta/banco?ssl-mode=REQUIRED (padrão do Aiven).
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return {}
    partes = urlparse(url)
    modo_ssl = parse_qs(partes.query).get("ssl-mode", [""])[0].upper()
    return {
        "DB_HOST": partes.hostname,
        "DB_PORT": str(partes.port or 3306),
        "DB_USER": unquote(partes.username or ""),
        "DB_PASSWORD": unquote(partes.password or ""),
        "DB_NAME": partes.path.lstrip("/") or "eventofacil",
        "DB_SSL": "true" if modo_ssl in ("REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY") else "",
    }


_URL = _banco_da_url()


def _db(nome, padrao=""):
    return _URL.get(nome) or os.getenv(nome, padrao)


class Config:
    # Chave usada para assinar o cookie de sessão do Flask.
    # Se não for definida, é gerada uma aleatória a cada execução
    # (os usuários precisam logar de novo quando o servidor reinicia).
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    # Em produção com HTTPS (RNF04), defina SESSION_COOKIE_SECURE=true
    SESSION_COOKIE_SECURE = _bool(os.getenv("SESSION_COOKIE_SECURE"))

    # ---------------- Banco de dados (MySQL) ----------------
    # Local: DB_HOST, DB_USER... no .env. Hospedagem: DATABASE_URL.
    DB_HOST = _db("DB_HOST", "localhost")
    DB_PORT = int(_db("DB_PORT", "3306"))
    DB_USER = _db("DB_USER", "root")
    DB_PASSWORD = _db("DB_PASSWORD", "")
    DB_NAME = _db("DB_NAME", "eventofacil")
    # Conexão criptografada (bancos na nuvem exigem). DB_SSL_CA aponta para o
    # certificado da autoridade do provedor, para conferir o servidor.
    DB_SSL = _bool(_db("DB_SSL"))
    DB_SSL_CA = os.getenv("DB_SSL_CA", "")

    # Hospedagem gratuita sem servidor de e-mail: mostra o código de
    # confirmação na própria tela (somente para demonstração do trabalho).
    DEMO_MOSTRAR_CODIGO = _bool(os.getenv("DEMO_MOSTRAR_CODIGO"))

    # Atrás do proxy da hospedagem (Render): usa o IP real do visitante
    # (limite de perguntas ao assistente) e reconhece o HTTPS.
    ATRAS_DE_PROXY = _bool(os.getenv("ATRAS_DE_PROXY"))

    # ---------------- Coordenação (RN04) ----------------
    ADMIN_SENHA = os.getenv("ADMIN_SENHA", "")

    # ---------------- E-mail (SMTP) ----------------
    # Se SMTP_HOST estiver vazio, o código de verificação é
    # exibido no console do backend (modo de desenvolvimento).
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USUARIO = os.getenv("SMTP_USUARIO", "")
    SMTP_SENHA = os.getenv("SMTP_SENHA", "")
    SMTP_REMETENTE = os.getenv("SMTP_REMETENTE", "") or os.getenv("SMTP_USUARIO", "")

    CODIGO_VALIDADE_MINUTOS = int(os.getenv("CODIGO_VALIDADE_MINUTOS", "10"))
    CODIGO_MAX_TENTATIVAS = 5

    # ---------------- Azure AI Foundry ----------------
    # Ponto de extremidade do PROJETO no Foundry
    AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT", "").rstrip("/")
    AZURE_API_KEY = os.getenv("AZURE_API_KEY", "")
    AZURE_AGENT_NAME = os.getenv("AZURE_AGENT_NAME", "agente-eventofacil")
    AZURE_API_VERSION = os.getenv("AZURE_API_VERSION", "2025-11-15-preview")
    AZURE_TIMEOUT_SEGUNDOS = int(os.getenv("AZURE_TIMEOUT_SEGUNDOS", "30"))

    # Limite simples de perguntas ao assistente por IP (protege a cota da chave)
    ASSISTENTE_LIMITE_POR_MINUTO = int(os.getenv("ASSISTENTE_LIMITE_POR_MINUTO", "15"))
