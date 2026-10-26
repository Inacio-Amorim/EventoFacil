"""
EventoFácil - Backend (Python / Flask)

Sobe a API em /api/... e também serve o front-end (pasta ../frontend),
então um único comando coloca o sistema inteiro no ar:

    python app.py   ->   http://localhost:5000
"""

import os
from datetime import timedelta

# Usa os certificados confiáveis do sistema operacional (Windows/macOS/Linux).
# Necessário em redes corporativas ou de faculdade que inspecionam HTTPS;
# sem isso a chamada ao Azure falha com CERTIFICATE_VERIFY_FAILED.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # pragma: no cover
    pass

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

import db
from config import FRONTEND_DIR, Config
from regras import ErroRegra
from routes import admin, assistente, auth, eventos, inscricoes


def create_app(config_extra=None):
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config.from_object(Config)
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
    if config_extra:
        app.config.update(config_extra)

    if app.config.get("ATRAS_DE_PROXY"):
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # Respostas JSON com acentos legíveis
    app.json.ensure_ascii = False

    db.init_app(app)

    for modulo in (auth, eventos, inscricoes, admin, assistente):
        app.register_blueprint(modulo.bp)

    # ---------------- Páginas do front-end ----------------
    @app.get("/")
    def pagina_inicial():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/admin")
    def pagina_admin():
        return send_from_directory(FRONTEND_DIR, "admin.html")

    @app.get("/api/saude")
    def saude():
        return jsonify({"status": "ok"})

    # ---------------- Tratamento de erros ----------------
    @app.errorhandler(ErroRegra)
    def tratar_erro_regra(e):
        corpo = {"erro": e.mensagem}
        if getattr(e, "campo", None):
            corpo["campo"] = e.campo
        return jsonify(corpo), e.status_http

    @app.errorhandler(HTTPException)
    def tratar_http(e):
        if request.path.startswith("/api/"):
            return jsonify({"erro": e.description}), e.code
        return e

    @app.errorhandler(Exception)
    def tratar_inesperado(e):
        app.logger.exception("Erro inesperado: %s", e)
        return jsonify({"erro": "Erro interno no servidor. Tente novamente."}), 500

    return app


app = create_app()

def verificar_banco():
    """Confere a conexão com o MySQL antes de subir o servidor."""
    try:
        conexao = db.conectar(app.config)
        with conexao.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total FROM evento")
        conexao.close()
        return True
    except Exception as e:  # noqa: BLE001
        print("\n  [ERRO] Não foi possível conectar ao MySQL:")
        print(f"         {e}\n")
        print("  Verifique:")
        print("   1. Se o MySQL está ligado;")
        print("   2. DB_USER e DB_PASSWORD no arquivo backend/.env;")
        print("   3. Se o script database/eventofacil.sql já foi executado.\n")
        return False


if __name__ == "__main__":
    if not verificar_banco():
        raise SystemExit(1)

    porta = int(os.getenv("PORT", "5000"))
    ia = "configurado" if app.config["AZURE_API_KEY"] else "NÃO configurado (.env)"
    email = "SMTP" if app.config["SMTP_HOST"] else "códigos aparecem aqui no terminal"
    print(f"\n  EventoFácil rodando em http://localhost:{porta}"
          f"\n  Área da coordenação:   http://localhost:{porta}/admin"
          f"\n  Assistente de IA:      {ia}"
          f"\n  E-mail de confirmação: {email}\n")
    app.run(host="127.0.0.1", port=porta, debug=os.getenv("FLASK_DEBUG") == "1")
