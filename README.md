# EventoFácil

Sistema de gerenciamento de eventos acadêmicos com assistente virtual de IA (Azure AI Foundry).
Projeto do curso de Análise e Desenvolvimento de Sistemas, Universidade Santo Amaro (Unisa), 2026.

**Equipe:** Guilherme Costa Soares (interface web), Inácio Castelo de Souza Amorim (Azure AI Foundry, integração via API e modelagem de dados), Samuel dos Anjos Souza (testes e validação) e Wallace Batista dos Santos (requisitos e documentação).

## O que o sistema faz

| Requisito | Como foi atendido |
|---|---|
| RF01 Visualização e filtro | Eventos vêm do MySQL, com filtro por categoria, busca e vagas atualizadas a cada 30 s |
| RF02 / RF03 Inscrição e validação | Inscrição com RA; o backend bloqueia evento lotado e inscrição duplicada |
| RF04 / RF05 / RF06 Assistente de IA | Chat ligado ao agente `agente-eventofacil` do Azure AI Foundry, que recebe o catálogo atualizado do banco a cada pergunta |
| RF07 Minhas inscrições | Lista das inscrições do aluno, com opção de cancelar |
| RF08 Coordenação | Área `/admin` para criar, editar, publicar, encerrar e cancelar eventos, ver inscritos e criar categorias |
| RN01 a RN03 | Transação com `SELECT ... FOR UPDATE`: duas pessoas não pegam a mesma última vaga, e o evento encerra sozinho ao lotar |
| RN04 | Rotas de gestão protegidas pela senha da coordenação |
| RN05 | O agente recebe só dados de eventos; as instruções do agente no Foundry limitam o escopo |
| RNF05 | A chave da Azure fica só no `backend/.env`, que não vai para o GitHub |
| RNF06 (LGPD) | Senhas com hash (scrypt); para a IA vão só o primeiro nome e as inscrições, nunca e-mail ou RA |

Cadastro com **confirmação por e-mail** (código de 6 dígitos) e **recuperação de senha** pelo mesmo mecanismo.

## Estrutura

```
frontend/   site (HTML, CSS, JS) e área da coordenação (admin.html)
backend/    API em Python/Flask, que também serve o site
database/   eventofacil.sql (cria o banco com dados de exemplo)
```

## Como rodar (Windows)

**Pré-requisitos:** Python 3.10 ou mais novo e MySQL 8 (pode ser com o MySQL Workbench).

1. **Banco de dados:** no MySQL Workbench, abra `database/eventofacil.sql` (File → Open SQL Script) e execute (ícone do raio). O script apaga e recria o banco `eventofacil`.
2. **Configuração:** dentro de `backend`, copie `.env.example` para `.env` e preencha:
   - `DB_PASSWORD`: senha do seu MySQL
   - `ADMIN_SENHA`: senha da área da coordenação
   - `AZURE_ENDPOINT`, `AZURE_API_KEY` e `AZURE_AGENT_NAME`: dados do agente no Foundry. Use o **ponto de extremidade do projeto** (`...services.ai.azure.com/api/projects/...`).
3. **Executar:** dê dois cliques em `backend/iniciar.bat`. Ou, pelo terminal:
   ```
   cd backend
   pip install -r requirements.txt
   python app.py
   ```
4. Acesse **http://localhost:5000**. A coordenação fica em **http://localhost:5000/admin**.

### Contas de teste

| Quem | E-mail | Senha |
|---|---|---|
| João da Silva | joao.teste@email.com | Teste@123 |
| Maria Oliveira | maria.teste@email.com | Teste@123 |
| Coordenação | (não tem e-mail) | o valor de `ADMIN_SENHA` no `.env` |

### E-mail de confirmação

Com `SMTP_HOST` vazio no `.env`, o código de 6 dígitos **aparece no terminal** onde o backend está rodando. Para enviar de verdade pelo Gmail, ative a verificação em 2 etapas, crie uma senha de app em https://myaccount.google.com/apppasswords e preencha `SMTP_HOST=smtp.gmail.com`, `SMTP_USUARIO` e `SMTP_SENHA`.

## Roteiro para a apresentação

1. Crie uma conta nova, mostre o código chegando e confirme o e-mail.
2. Abra o **Workshop de Python para Iniciantes**: ele tem 3 vagas e 2 inscritos. Inscreva-se e mostre que o evento **encerra sozinho** (RN03). Com outra conta, mostre que a inscrição é recusada (RN01).
3. No **Assistente IA**, pergunte "Tenho interesse em Python e IA, o que você recomenda?". A resposta vem do agente do Foundry e os eventos citados viram botões de inscrição.
4. Em `/admin`, publique a **Semana Acadêmica de ADS 2026** (ela está como Planejado) e mostre que ela aparece para os alunos.

## Testes automatizados

```
cd backend
python -m pytest
```

São 38 testes: regras RN01 a RN04, cadastro e confirmação, recuperação de senha, perfil, coordenação, LGPD e o formato da chamada ao Azure. Inclui um teste em que dois alunos disputam a última vaga ao mesmo tempo. Os testes criam um banco separado (`eventofacil_test`) e não mexem no banco principal.

## API

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/eventos` | Lista os eventos visíveis (filtros `categoria` e `busca`) |
| GET | `/api/eventos/{id}` | Detalhe de um evento |
| GET | `/api/categorias` | Categorias |
| POST | `/api/inscricoes` | Inscreve o aluno logado (`{"id_evento": 1}`) |
| DELETE | `/api/inscricoes/{id_evento}` | Cancela a inscrição |
| GET | `/api/inscricoes/aluno/{id}` | Inscrições do aluno (só as próprias) |
| POST | `/api/assistente/perguntar` | Pergunta ao agente (`{"mensagem": "...", "conversation_id": null}`) |
| POST | `/api/auth/cadastro`, `/api/auth/confirmar-email`, `/api/auth/login`, `/api/auth/logout` | Conta do aluno |
| POST | `/api/auth/recuperar-senha` (+ `/verificar`, `/redefinir`) | Esqueci a senha |
| POST/PUT/PATCH/DELETE | `/api/admin/...` | Gestão de eventos e categorias (coordenação) |

## Problemas comuns

- **`CERTIFICATE_VERIFY_FAILED` ao chamar a IA:** a rede (por exemplo, a de uma empresa) inspeciona HTTPS. O backend já usa o pacote `truststore`, que confia nos certificados do Windows. Rode `pip install -r requirements.txt` de novo.
- **`Access denied for user` ao iniciar:** a senha do MySQL no `backend/.env` está errada.
- **"Assistente não configurado":** faltam `AZURE_ENDPOINT` ou `AZURE_API_KEY` no `.env`.
- **O assistente não responde:** confira se o endpoint é o **do projeto** e se a chave não foi regenerada no portal da Azure.
