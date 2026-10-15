"""Validações de entrada usadas pelas rotas."""

import re
from datetime import datetime

from regras import ErroRegra

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
RA_RE = re.compile(r"^[A-Za-z0-9\-]{4,20}$")


def texto(dados, campo, obrigatorio=True, maximo=None, rotulo=None):
    valor = dados.get(campo)
    valor = "" if valor is None else str(valor).strip()
    rotulo = rotulo or campo
    if obrigatorio and not valor:
        raise ErroCampo(campo, f"Preencha o campo {rotulo}.")
    if maximo and len(valor) > maximo:
        raise ErroCampo(campo, f"O campo {rotulo} aceita no máximo {maximo} caracteres.")
    return valor


def nome_completo(valor, campo="nome"):
    valor = " ".join((valor or "").split())
    if not valor:
        raise ErroCampo(campo, "Digite seu nome completo.")
    if len(valor.split(" ")) < 2:
        raise ErroCampo(campo, "Digite nome e sobrenome.")
    if len(valor) > 120:
        raise ErroCampo(campo, "Nome muito longo (máximo 120 caracteres).")
    return valor


def email(valor, campo="email"):
    valor = (valor or "").strip().lower()
    if not valor:
        raise ErroCampo(campo, "Digite seu e-mail.")
    if not EMAIL_RE.match(valor) or len(valor) > 120:
        raise ErroCampo(campo, "Digite um e-mail válido.")
    return valor


def ra(valor, campo="ra"):
    valor = (valor or "").strip().upper()
    if not valor:
        raise ErroCampo(campo, "Digite seu RA.")
    if not RA_RE.match(valor):
        raise ErroCampo(campo, "RA inválido: use de 4 a 20 letras, números ou hífen.")
    return valor


def senha(valor, campo="senha"):
    valor = valor or ""
    if not valor:
        raise ErroCampo(campo, "Digite uma senha.")
    if len(valor) < 6:
        raise ErroCampo(campo, "A senha deve ter pelo menos 6 caracteres.")
    if len(valor) > 128:
        raise ErroCampo(campo, "Senha muito longa.")
    return valor


def inteiro_positivo(valor, campo, rotulo):
    try:
        numero = int(valor)
    except (TypeError, ValueError):
        raise ErroCampo(campo, f"{rotulo} deve ser um número inteiro.")
    if numero <= 0:
        raise ErroCampo(campo, f"{rotulo} deve ser maior que zero.")
    return numero


def data_hora(valor, campo="data_evento"):
    valor = (valor or "").strip()
    for formato in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(valor, formato)
        except ValueError:
            continue
    raise ErroCampo(campo, "Informe data e horário válidos.")


class ErroCampo(ErroRegra):
    """Erro de validação ligado a um campo do formulário."""

    def __init__(self, campo, mensagem):
        super().__init__(400, mensagem)
        self.campo = campo
