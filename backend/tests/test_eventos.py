"""RF01 - listagem e filtro de eventos."""


def test_lista_so_eventos_visiveis(client):
    eventos = client.get("/api/eventos").get_json()
    titulos = [e["titulo"] for e in eventos]
    assert len(eventos) == 7
    # Evento "Planejado" não aparece para os alunos
    assert "Semana Acadêmica de ADS 2026" not in titulos
    # Ordenado por data
    datas = [e["data_evento"] for e in eventos]
    assert datas == sorted(datas)


def test_vagas_disponiveis_em_tempo_real(client):
    eventos = client.get("/api/eventos").get_json()
    workshop = next(e for e in eventos if e["titulo"] == "Workshop de Python para Iniciantes")
    assert workshop["vagas_totais"] == 3
    assert workshop["inscritos"] == 2
    assert workshop["vagas_disponiveis"] == 1
    assert workshop["categoria"] == "Tecnologia"


def test_filtro_por_categoria_e_busca(client):
    tecnologia = client.get("/api/eventos?categoria=Tecnologia").get_json()
    assert {e["categoria"] for e in tecnologia} == {"Tecnologia"}
    assert len(tecnologia) == 3

    busca = client.get("/api/eventos?busca=python").get_json()
    assert [e["titulo"] for e in busca] == ["Workshop de Python para Iniciantes"]


def test_detalhe_e_evento_oculto(client):
    eventos = client.get("/api/eventos").get_json()
    r = client.get(f"/api/eventos/{eventos[0]['id_evento']}")
    assert r.status_code == 200
    assert r.get_json()["titulo"] == eventos[0]["titulo"]

    # id 8 = evento Planejado
    assert client.get("/api/eventos/8").status_code == 404
    assert client.get("/api/eventos/999").status_code == 404


def test_categorias(client):
    nomes = [c["nome"] for c in client.get("/api/categorias").get_json()]
    assert nomes == ["Acadêmico", "Carreira", "Criatividade", "Tecnologia"]


def test_front_end_servido_pelo_flask(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"EventoF" in r.data
    assert client.get("/css/style.css").status_code == 200
    # O .env do backend nunca pode ser servido
    assert client.get("/../backend/.env").status_code == 404
    assert client.get("/backend/.env").status_code == 404
