"""Cadastro com confirmação por e-mail, login, recuperação de senha e perfil."""

from conftest import cadastrar_e_confirmar, login


def test_cadastro_exige_confirmacao_de_email(client, codigos_enviados):
    r = client.post("/api/auth/cadastro", json={
        "nome": "Ana Souza", "email": "ANA@email.com", "ra": "ra2026100", "senha": "segredo1",
    })
    assert r.status_code == 201
    assert r.get_json()["email"] == "ana@email.com"
    assert codigos_enviados[-1]["tipo"] == "CONFIRMACAO"

    # Sem confirmar, não entra
    r = client.post("/api/auth/login", json={"email": "ana@email.com", "senha": "segredo1"})
    assert r.status_code == 403
    assert r.get_json()["codigo"] == "EMAIL_NAO_CONFIRMADO"

    # Código errado
    r = client.post("/api/auth/confirmar-email", json={"email": "ana@email.com", "codigo": "000000"})
    if codigos_enviados[-1]["codigo"] != "000000":
        assert r.status_code == 400

    # Código certo (o último enviado) -> confirma e já faz login
    codigo = codigos_enviados[-1]["codigo"]
    r = client.post("/api/auth/confirmar-email", json={"email": "ana@email.com", "codigo": codigo})
    assert r.status_code == 200
    assert r.get_json()["aluno"]["ra"] == "RA2026100"
    assert client.get("/api/auth/me").get_json()["aluno"]["email"] == "ana@email.com"

    # O código não pode ser reutilizado / login normal funciona
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").get_json() == {"aluno": None}
    login(client, "ana@email.com", "segredo1")


def test_senha_guardada_como_hash(app, client, codigos_enviados):
    cadastrar_e_confirmar(client, codigos_enviados)
    import db
    with app.app_context():
        aluno = db.consultar("SELECT senha_hash FROM aluno WHERE email = 'ana@email.com'", um=True)
    assert "segredo1" not in aluno["senha_hash"]
    assert aluno["senha_hash"].startswith(("scrypt:", "pbkdf2:"))


def test_validacoes_do_cadastro(client):
    casos = [
        ({"nome": "Ana", "email": "a@a.com", "ra": "RA1234", "senha": "123456"}, "nome"),
        ({"nome": "Ana Souza", "email": "invalido", "ra": "RA1234", "senha": "123456"}, "email"),
        ({"nome": "Ana Souza", "email": "a@a.com", "ra": "R$", "senha": "123456"}, "ra"),
        ({"nome": "Ana Souza", "email": "a@a.com", "ra": "RA1234", "senha": "123"}, "senha"),
        # E-mail e RA que já existem (João, dos dados de exemplo)
        ({"nome": "Ana Souza", "email": "joao.teste@email.com", "ra": "RA9999", "senha": "123456"}, "email"),
        ({"nome": "Ana Souza", "email": "a@a.com", "ra": "RA2026001", "senha": "123456"}, "ra"),
    ]
    for corpo, campo in casos:
        r = client.post("/api/auth/cadastro", json=corpo)
        assert r.status_code == 400, corpo
        assert r.get_json()["campo"] == campo, corpo


def test_login_mensagens_por_campo(client):
    r = client.post("/api/auth/login", json={"email": "ninguem@email.com", "senha": "x"})
    assert r.status_code == 400 and r.get_json()["campo"] == "email"
    r = client.post("/api/auth/login", json={"email": "joao.teste@email.com", "senha": "errada"})
    assert r.status_code == 400 and r.get_json()["campo"] == "senha"
    login(client)


def test_codigo_bloqueia_apos_muitas_tentativas(client, codigos_enviados):
    client.post("/api/auth/cadastro", json={
        "nome": "Ana Souza", "email": "ana@email.com", "ra": "RA2026100", "senha": "segredo1",
    })
    certo = codigos_enviados[-1]["codigo"]
    errado = "111111" if certo != "111111" else "222222"
    for _ in range(5):
        client.post("/api/auth/confirmar-email", json={"email": "ana@email.com", "codigo": errado})
    r = client.post("/api/auth/confirmar-email", json={"email": "ana@email.com", "codigo": certo})
    assert r.status_code == 429


def test_recuperacao_de_senha(client, codigos_enviados):
    r = client.post("/api/auth/recuperar-senha", json={"email": "joao.teste@email.com"})
    assert r.status_code == 200
    codigo = codigos_enviados[-1]["codigo"]
    assert codigos_enviados[-1]["tipo"] == "RECUPERACAO"

    # Sem verificar o código, não redefine
    outro = client.application.test_client()
    assert outro.post("/api/auth/recuperar-senha/redefinir", json={"senha": "nova123"}).status_code == 400

    r = client.post("/api/auth/recuperar-senha/verificar",
                    json={"email": "joao.teste@email.com", "codigo": codigo})
    assert r.status_code == 200
    r = client.post("/api/auth/recuperar-senha/redefinir", json={"senha": "nova123"})
    assert r.status_code == 200

    r = client.post("/api/auth/login", json={"email": "joao.teste@email.com", "senha": "Teste@123"})
    assert r.status_code == 400
    login(client, senha="nova123")


def test_recuperacao_email_inexistente(client):
    r = client.post("/api/auth/recuperar-senha", json={"email": "ninguem@email.com"})
    assert r.status_code == 400 and r.get_json()["campo"] == "email"


def test_perfil_exige_reautenticacao(client):
    login(client)
    r = client.patch("/api/perfil", json={"campo": "nome", "valor": "João Pedro Silva"})
    assert r.status_code == 403

    assert client.post("/api/perfil/reautenticar", json={"senha": "errada"}).status_code == 400
    assert client.post("/api/perfil/reautenticar", json={"senha": "Teste@123"}).status_code == 200

    r = client.patch("/api/perfil", json={"campo": "nome", "valor": "João Pedro Silva"})
    assert r.status_code == 200
    assert r.get_json()["aluno"]["nome"] == "João Pedro Silva"

    r = client.patch("/api/perfil", json={"campo": "email", "valor": "maria.teste@email.com"})
    assert r.status_code == 400  # e-mail de outra pessoa

    r = client.patch("/api/perfil", json={"campo": "senha", "valor": "outra123"})
    assert r.status_code == 200
    client.post("/api/auth/logout")
    login(client, senha="outra123")
