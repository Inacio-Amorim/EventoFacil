"""
Envio de e-mail (SMTP).

Modo mais simples possível:
  * Com SMTP configurado no .env, o e-mail é enviado de verdade
    (ex.: Gmail com "senha de app").
  * Sem SMTP configurado, o código é exibido no console do backend,
    para que o sistema possa ser testado sem servidor de e-mail.
"""

import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app

ASSUNTOS = {
    "CONFIRMACAO": "EventoFácil - confirme seu e-mail",
    "RECUPERACAO": "EventoFácil - código para redefinir sua senha",
}

TEXTOS = {
    "CONFIRMACAO": (
        "Olá, {nome}!\n\n"
        "Seu código de confirmação do EventoFácil é: {codigo}\n\n"
        "Ele vale por {minutos} minutos. Digite-o na tela de cadastro "
        "para ativar sua conta.\n\n"
        "Se você não criou uma conta, ignore este e-mail."
    ),
    "RECUPERACAO": (
        "Olá, {nome}!\n\n"
        "Seu código para redefinir a senha do EventoFácil é: {codigo}\n\n"
        "Ele vale por {minutos} minutos.\n\n"
        "Se você não pediu a troca de senha, ignore este e-mail."
    ),
}


def enviar_codigo(destinatario, nome, codigo, tipo):
    cfg = current_app.config
    minutos = cfg["CODIGO_VALIDADE_MINUTOS"]
    corpo = TEXTOS[tipo].format(nome=nome.split(" ")[0], codigo=codigo, minutos=minutos)

    if not cfg["SMTP_HOST"]:
        # Modo desenvolvimento: mostra o código no terminal do backend
        current_app.logger.warning(
            "\n" + "=" * 60 +
            f"\n[E-MAIL SIMULADO] Para: {destinatario}"
            f"\n{ASSUNTOS[tipo]}"
            f"\nCÓDIGO: {codigo}\n" + "=" * 60
        )
        return

    msg = EmailMessage()
    msg["Subject"] = ASSUNTOS[tipo]
    msg["From"] = cfg["SMTP_REMETENTE"]
    msg["To"] = destinatario
    msg.set_content(corpo)

    contexto = ssl.create_default_context()
    if cfg["SMTP_PORT"] == 465:
        with smtplib.SMTP_SSL(cfg["SMTP_HOST"], 465, context=contexto, timeout=15) as smtp:
            smtp.login(cfg["SMTP_USUARIO"], cfg["SMTP_SENHA"])
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(cfg["SMTP_HOST"], cfg["SMTP_PORT"], timeout=15) as smtp:
            smtp.starttls(context=contexto)
            smtp.login(cfg["SMTP_USUARIO"], cfg["SMTP_SENHA"])
            smtp.send_message(msg)
