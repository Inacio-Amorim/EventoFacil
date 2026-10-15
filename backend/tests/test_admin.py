"""RF08 / RN04 - gestão de eventos pela coordenação."""

NOVO_EVENTO = {
    "titulo": "Hackathon EventoFácil",
    "descricao": "24 horas de código.",
    "data_evento": "2026-12-10T09:00",
    "local": "Laboratório 01",
    "vagas_totais": 2,
    "id_categoria": 4,
}


def entrar(client, senha="coord-teste"):
    return client.post("/api/admin/login", json={"senha": senha})


def test_rotas_protegidas(client):
    assert client.get("/api/admin/eventos").status_code == 403
    assert client.post("/api/admin/eventos", json=NOVO_EVENTO).status_code == 403
    # Aluno logado também não tem acesso (RN04)
    client.post("/api/auth/login", json={"email": "joao.teste@email.com", "senha": "Teste@123"})
    assert client.get("/api/admin/eventos").status_code == 403
    assert entrar(client, "errada").status_code == 400


def test_ciclo_de_vida_do_evento(client):
    assert entrar(client).status_code == 200
    assert len(client.get("/api/admin/eventos").get_json()) == 8

    r = client.post("/api/admin/eventos", json=NOVO_EVENTO)
    assert r.status_code == 201
    novo = r.get_json()["id_evento"]

    # Planejado não aparece para alunos
    assert client.get(f"/api/eventos/{novo}").status_code == 404

    # Transição inválida (Planejado -> Concluído)
    r = client.patch(f"/api/admin/eventos/{novo}/status", json={"status": "Concluído"})
    assert r.status_code == 409

    # Publicar
    r = client.patch(f"/api/admin/eventos/{novo}/status", json={"status": "Inscrições Abertas"})
    assert r.status_code == 200
    assert client.get(f"/api/eventos/{novo}").status_code == 200

    # Editar
    editado = {**NOVO_EVENTO, "titulo": "Hackathon EventoFácil 2026", "vagas_totais": 5}
    assert client.put(f"/api/admin/eventos/{novo}", json=editado).status_code == 200
    assert client.get(f"/api/eventos/{novo}").get_json()["titulo"] == "Hackathon EventoFácil 2026"

    # Cancelar (some da lista dos alunos e não pode mais ser editado)
    assert client.delete(f"/api/admin/eventos/{novo}").status_code == 200
    assert client.get(f"/api/eventos/{novo}").status_code == 404
    assert client.put(f"/api/admin/eventos/{novo}", json=editado).status_code == 409


def test_vagas_nao_podem_ficar_abaixo_dos_inscritos(client):
    entrar(client)
    workshop = 7  # 2 inscritos
    corpo = {**NOVO_EVENTO, "titulo": "Workshop de Python para Iniciantes", "vagas_totais": 1}
    r = client.put(f"/api/admin/eventos/{workshop}", json=corpo)
    assert r.status_code == 400 and r.get_json()["campo"] == "vagas_totais"

    # Reduzir para exatamente 2 lota o evento -> RN03 encerra
    corpo["vagas_totais"] = 2
    assert client.put(f"/api/admin/eventos/{workshop}", json=corpo).status_code == 200
    evento = next(e for e in client.get("/api/admin/eventos").get_json() if e["id_evento"] == workshop)
    assert evento["status"] == "Inscrições Encerradas"

    # Reabrir sem vagas não pode
    r = client.patch(f"/api/admin/eventos/{workshop}/status", json={"status": "Inscrições Abertas"})
    assert r.status_code == 409


def test_validacao_e_inscritos(client):
    entrar(client)
    r = client.post("/api/admin/eventos", json={**NOVO_EVENTO, "vagas_totais": 0})
    assert r.status_code == 400 and r.get_json()["campo"] == "vagas_totais"
    r = client.post("/api/admin/eventos", json={**NOVO_EVENTO, "data_evento": "amanhã"})
    assert r.status_code == 400 and r.get_json()["campo"] == "data_evento"
    r = client.post("/api/admin/eventos", json={**NOVO_EVENTO, "id_categoria": 99})
    assert r.status_code == 400 and r.get_json()["campo"] == "id_categoria"

    inscritos = client.get("/api/admin/eventos/7/inscritos").get_json()
    assert [i["ra"] for i in inscritos] == ["RA2026001", "RA2026002"]


def test_categorias(client):
    entrar(client)
    assert client.post("/api/admin/categorias", json={"nome": "Esportes"}).status_code == 201
    r = client.post("/api/admin/categorias", json={"nome": "Esportes"})
    assert r.status_code == 400
    assert "Esportes" in [c["nome"] for c in client.get("/api/categorias").get_json()]
