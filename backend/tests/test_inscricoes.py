"""RF02, RF03, RF07 e as regras RN01, RN02 e RN03."""

import threading

from conftest import cadastrar_e_confirmar, id_evento, login

WORKSHOP = "Workshop de Python para Iniciantes"  # 3 vagas, 2 inscritos


def status_do_evento(client, titulo):
    return next(e for e in client.get("/api/eventos").get_json() if e["titulo"] == titulo)


def test_inscricao_exige_login(client):
    assert client.post("/api/inscricoes", json={"id_evento": 1}).status_code == 401


def test_inscricao_e_rn02_duplicada(client):
    login(client)  # João já está inscrito no workshop e na IA Generativa
    carreira = id_evento(client, "Carreira & Primeiro Emprego")

    r = client.post("/api/inscricoes", json={"id_evento": carreira})
    assert r.status_code == 201
    assert r.get_json()["vagas_disponiveis"] == 79

    r = client.post("/api/inscricoes", json={"id_evento": carreira})
    assert r.status_code == 409
    assert "já está inscrito" in r.get_json()["erro"]

    minhas = client.get("/api/inscricoes/minhas").get_json()
    assert {i["titulo"] for i in minhas} == {
        "IA Generativa na Prática", WORKSHOP, "Carreira & Primeiro Emprego"
    }
    assert status_do_evento(client, "Carreira & Primeiro Emprego")["inscrito"] is True


def test_rn03_encerra_ao_lotar_e_rn01_bloqueia(client, novo_client, codigos_enviados):
    cadastrar_e_confirmar(client, codigos_enviados)
    workshop = id_evento(client, WORKSHOP)

    # Última vaga: inscreve e encerra automaticamente (RN03)
    r = client.post("/api/inscricoes", json={"id_evento": workshop})
    assert r.status_code == 201
    assert r.get_json()["evento_encerrado"] is True
    evento = status_do_evento(client, WORKSHOP)
    assert evento["status"] == "Inscrições Encerradas"
    assert evento["vagas_disponiveis"] == 0

    # Outro aluno não consegue (RN01)
    outro = novo_client()
    cadastrar_e_confirmar(outro, codigos_enviados, nome="Bruno Lima",
                          email="bruno@email.com", ra="RA2026200")
    r = outro.post("/api/inscricoes", json={"id_evento": workshop})
    assert r.status_code == 409
    assert "lotado" in r.get_json()["erro"].lower()


def test_cancelamento_reabre_evento_lotado(client, novo_client, codigos_enviados):
    cadastrar_e_confirmar(client, codigos_enviados)
    workshop = id_evento(client, WORKSHOP)
    client.post("/api/inscricoes", json={"id_evento": workshop})
    assert status_do_evento(client, WORKSHOP)["status"] == "Inscrições Encerradas"

    r = client.delete(f"/api/inscricoes/{workshop}")
    assert r.status_code == 200
    assert r.get_json()["evento_reaberto"] is True
    assert status_do_evento(client, WORKSHOP)["status"] == "Inscrições Abertas"

    # Pode se inscrever de novo (reaproveita a linha por causa do UNIQUE)
    assert client.post("/api/inscricoes", json={"id_evento": workshop}).status_code == 201
    assert client.delete("/api/inscricoes/999").status_code == 404


def test_ultima_vaga_disputada_ao_mesmo_tempo(client, novo_client, codigos_enviados):
    """Dois alunos clicam na última vaga no mesmo instante: só um consegue."""
    a, b = novo_client(), novo_client()
    cadastrar_e_confirmar(a, codigos_enviados, nome="Ana Souza", email="ana@email.com", ra="RA2026100")
    cadastrar_e_confirmar(b, codigos_enviados, nome="Bruno Lima", email="bruno@email.com", ra="RA2026200")
    workshop = id_evento(client, WORKSHOP)

    resultados = []
    barreira = threading.Barrier(2)

    def tentar(cliente):
        barreira.wait()
        resultados.append(cliente.post("/api/inscricoes", json={"id_evento": workshop}).status_code)

    threads = [threading.Thread(target=tentar, args=(c,)) for c in (a, b)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(resultados) == [201, 409]
    evento = status_do_evento(client, WORKSHOP)
    assert evento["inscritos"] == 3 and evento["status"] == "Inscrições Encerradas"


def test_evento_planejado_nao_aceita_inscricao(client):
    login(client)
    r = client.post("/api/inscricoes", json={"id_evento": 8})
    assert r.status_code == 409


def test_rf07_aluno_so_ve_as_proprias_inscricoes(client):
    aluno = login(client)
    r = client.get(f"/api/inscricoes/aluno/{aluno['id_aluno']}")
    assert r.status_code == 200 and len(r.get_json()) == 2
    assert client.get(f"/api/inscricoes/aluno/{aluno['id_aluno'] + 1}").status_code == 403
