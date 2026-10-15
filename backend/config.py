"""
Configurações do backend do EventoFácil.

Todas as credenciais vêm de variáveis de ambiente (arquivo .env),
nunca do código-fonte (ADR03 / RNF05).
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# Carrega o arquivo backend/.env (se existir)
load_dotenv(BASE_DIR / ".env")


def _bool(valor, padrao=False):
    if valor is None or valor == "":
        return padrao
    return str(valor).strip().lower() in ("1", "true", "sim", "yes", "on")


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
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "eventofacil")

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
