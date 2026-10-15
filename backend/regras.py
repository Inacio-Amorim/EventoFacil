"""
Regras de negócio do EventoFácil.

RN01 - Só inscreve se houver vaga.
RN02 - O mesmo aluno não se inscreve duas vezes no mesmo evento.
RN03 - Ao atingir o total de vagas, o evento passa para
       "Inscrições Encerradas" automaticamente.
RN04 - Só a coordenação cria/edita/cancela eventos (ver routes/admin.py).

As operações de inscrição rodam dentro de uma transação e travam a
linha do evento com SELECT ... FOR UPDATE. Assim, se dois alunos
tentarem pegar a última vaga ao mesmo tempo, só um consegue.
"""

from datetime import datetime

import pymysql

from db import get_db

# Estados do Diagrama de Estados (seção 3.10 do documento)
PLANEJADO = "Planejado"
ABERTAS = "Inscrições Abertas"
ENCERRADAS = "Inscrições Encerradas"
EM_ANDAMENTO = "Em Andamento"
CONCLUIDO = "Concluído"
CANCELADO = "Cancelado"

STATUS_EVENTO = [PLANEJADO, ABERTAS, ENCERRADAS, EM_ANDAMENTO, CONCLUIDO, CANCELADO]

# Eventos que aparecem para os alunos.
# "Inscrições Encerradas" também aparece, marcado como lotado.
STATUS_VISIVEIS_ALUNO = [ABERTAS, ENCERRADAS, EM_ANDAMENTO]

# Transições permitidas (Diagrama de Estados)
TRANSICOES = {
    PLANEJADO: {ABERTAS, CANCELADO},
    ABERTAS: {ENCERRADAS, CANCELADO},
    # Encerradas -> Abertas: reabrir quando surgirem vagas
    ENCERRADAS: {ABERTAS, EM_ANDAMENTO, CANCELADO},
    EM_ANDAMENTO: {CONCLUIDO},
    CONCLUIDO: set(),
    CANCELADO: set(),
}

INSCRICAO_CONFIRMADA = "Confirmada"
INSCRICAO_CANCELADA = "Cancelada"


class ErroRegra(Exception):
    """Erro de regra de negócio, com o status HTTP a devolver."""

    def __init__(self, status_http, mensagem):
        super().__init__(mensagem)
        self.status_http = status_http
        self.mensagem = mensagem


def _travar_evento(cur, id_evento):
    cur.execute(
        "SELECT id_evento, titulo, vagas_totais, status, data_evento "
        "FROM evento WHERE id_evento = %s FOR UPDATE",
        (id_evento,),
    )
    evento = cur.fetchone()
    if not evento:
        raise ErroRegra(404, "Evento não encontrado.")
    return evento


def _contar_inscritos(cur, id_evento):
    cur.execute(
        "SELECT COUNT(*) AS total FROM inscricao "
        "WHERE id_evento = %s AND status = %s",
        (id_evento, INSCRICAO_CONFIRMADA),
    )
    return cur.fetchone()["total"]


def inscrever(id_aluno, id_evento):
    """Inscreve o aluno no evento aplicando RN01, RN02 e RN03."""
    db = get_db()
    try:
        with db.cursor() as cur:
            evento = _travar_evento(cur, id_evento)

            cur.execute(
                "SELECT id_inscricao, status FROM inscricao "
                "WHERE id_aluno = %s AND id_evento = %s FOR UPDATE",
                (id_aluno, id_evento),
            )
            existente = cur.fetchone()

            # RN02 - inscrição duplicada
            if existente and existente["status"] == INSCRICAO_CONFIRMADA:
                raise ErroRegra(409, "Você já está inscrito neste evento.")

            if evento["status"] != ABERTAS:
                if evento["status"] == ENCERRADAS:
                    raise ErroRegra(409, "Evento lotado: as inscrições estão encerradas.")
                raise ErroRegra(
                    409,
                    f"As inscrições para este evento não estão abertas "
                    f"(status: {evento['status']}).",
                )

            inscritos = _contar_inscritos(cur, id_evento)

            # RN01 - vagas disponíveis
            if inscritos >= evento["vagas_totais"]:
                cur.execute(
                    "UPDATE evento SET status = %s WHERE id_evento = %s",
                    (ENCERRADAS, id_evento),
                )
                db.commit()
                raise ErroRegra(409, "Não há vagas disponíveis para este evento.")

            if existente:
                # O aluno tinha cancelado e está se inscrevendo de novo.
                # Reaproveita a linha por causa do UNIQUE (id_aluno, id_evento).
                cur.execute(
                    "UPDATE inscricao SET status = %s, data_inscricao = NOW() "
                    "WHERE id_inscricao = %s",
                    (INSCRICAO_CONFIRMADA, existente["id_inscricao"]),
                )
                id_inscricao = existente["id_inscricao"]
            else:
                cur.execute(
                    "INSERT INTO inscricao (id_aluno, id_evento, status) "
                    "VALUES (%s, %s, %s)",
                    (id_aluno, id_evento, INSCRICAO_CONFIRMADA),
                )
                id_inscricao = cur.lastrowid

            inscritos += 1
            encerrou = False

            # RN03 - encerramento automático ao lotar
            if inscritos >= evento["vagas_totais"]:
                cur.execute(
                    "UPDATE evento SET status = %s WHERE id_evento = %s",
                    (ENCERRADAS, id_evento),
                )
                encerrou = True

        db.commit()
    except pymysql.err.IntegrityError:
        db.rollback()
        raise ErroRegra(409, "Você já está inscrito neste evento.")
    except Exception:
        db.rollback()
        raise

    return {
        "id_inscricao": id_inscricao,
        "id_evento": id_evento,
        "status": INSCRICAO_CONFIRMADA,
        "vagas_disponiveis": evento["vagas_totais"] - inscritos,
        "evento_encerrado": encerrou,
    }


def cancelar_inscricao(id_aluno, id_evento):
    """Cancela a inscrição do aluno. Se o evento estava lotado e a data
    ainda não chegou, ele volta para "Inscrições Abertas"."""
    db = get_db()
    try:
        with db.cursor() as cur:
            evento = _travar_evento(cur, id_evento)

            cur.execute(
                "SELECT id_inscricao FROM inscricao "
                "WHERE id_aluno = %s AND id_evento = %s AND status = %s FOR UPDATE",
                (id_aluno, id_evento, INSCRICAO_CONFIRMADA),
            )
            inscricao = cur.fetchone()
            if not inscricao:
                raise ErroRegra(404, "Você não possui inscrição ativa neste evento.")

            if evento["status"] in (EM_ANDAMENTO, CONCLUIDO):
                raise ErroRegra(409, "Não é possível cancelar: o evento já começou.")

            cur.execute(
                "UPDATE inscricao SET status = %s WHERE id_inscricao = %s",
                (INSCRICAO_CANCELADA, inscricao["id_inscricao"]),
            )

            reaberto = False
            inscritos = _contar_inscritos(cur, id_evento)
            if (
                evento["status"] == ENCERRADAS
                and inscritos < evento["vagas_totais"]
                and evento["data_evento"] > datetime.now()
            ):
                cur.execute(
                    "UPDATE evento SET status = %s WHERE id_evento = %s",
                    (ABERTAS, id_evento),
                )
                reaberto = True

        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"id_evento": id_evento, "status": INSCRICAO_CANCELADA, "evento_reaberto": reaberto}


def alterar_status_evento(id_evento, novo_status):
    """Muda o status do evento respeitando o Diagrama de Estados."""
    if novo_status not in STATUS_EVENTO:
        raise ErroRegra(400, "Status inválido.")

    db = get_db()
    try:
        with db.cursor() as cur:
            evento = _travar_evento(cur, id_evento)
            atual = evento["status"]

            if novo_status == atual:
                return {"id_evento": id_evento, "status": atual}

            if novo_status not in TRANSICOES[atual]:
                raise ErroRegra(
                    409, f"Não é possível mudar de \"{atual}\" para \"{novo_status}\"."
                )

            if novo_status == ABERTAS:
                if _contar_inscritos(cur, id_evento) >= evento["vagas_totais"]:
                    raise ErroRegra(
                        409, "Não há vagas: aumente o total de vagas antes de reabrir."
                    )

            cur.execute(
                "UPDATE evento SET status = %s WHERE id_evento = %s",
                (novo_status, id_evento),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"id_evento": id_evento, "status": novo_status}


def ajustar_status_por_lotacao(cur, id_evento):
    """Depois de editar o total de vagas: se ficou lotado, encerra (RN03)."""
    cur.execute(
        "SELECT vagas_totais, status FROM evento WHERE id_evento = %s FOR UPDATE",
        (id_evento,),
    )
    evento = cur.fetchone()
    if evento and evento["status"] == ABERTAS:
        if _contar_inscritos(cur, id_evento) >= evento["vagas_totais"]:
            cur.execute(
                "UPDATE evento SET status = %s WHERE id_evento = %s",
                (ENCERRADAS, id_evento),
            )
