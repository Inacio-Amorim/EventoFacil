-- ============================================================
-- EventoFácil
-- Banco de Dados - eventofacil
-- MySQL 8.0.16+ (usa CHECK constraints)
--
-- Versão 2 - revisada para integração com o Backend (Flask).
--
-- O que mudou em relação à versão 1:
--   * evento.status passou de VARCHAR(20) para VARCHAR(30):
--     "Inscrições Encerradas" tem 21 caracteres e não cabia,
--     o que fazia a RN03 falhar no MySQL.
--   * evento.status agora só aceita os estados do Diagrama de
--     Estados (CHECK).
--   * evento.imagem_url: imagem exibida no card do front-end.
--   * aluno: e-mail e RA passaram a ser UNIQUE (RN02 / RF03 identificam
--     o aluno pelo RA); novas colunas senha_hash, email_confirmado
--     e data_cadastro (login com confirmação por e-mail).
--   * Nova tabela codigo_verificacao: códigos de 6 dígitos enviados
--     por e-mail (confirmação de cadastro e recuperação de senha).
--   * Nova view vw_evento_vagas: eventos com inscritos e vagas
--     disponíveis (base do RF01 e do assistente de IA).
--   * Dados de exemplo alinhados com as categorias e os eventos
--     usados no front-end.
--
-- ATENÇÃO: este script APAGA e recria o banco eventofacil.
-- Use apenas em ambiente de desenvolvimento/apresentação.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Criação do banco
-- ------------------------------------------------------------
-- Garante que acentos (Acadêmico, Inscrições...) sejam gravados
-- corretamente mesmo se o cliente estiver configurado em latin1.
SET NAMES utf8mb4;

DROP DATABASE IF EXISTS eventofacil;

CREATE DATABASE eventofacil
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE eventofacil;


-- ------------------------------------------------------------
-- 2. Tabela: categoria
-- ------------------------------------------------------------
CREATE TABLE categoria (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,

    CONSTRAINT uq_categoria_nome UNIQUE (nome)
) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- 3. Tabela: evento
-- ------------------------------------------------------------
CREATE TABLE evento (
    id_evento INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    descricao TEXT,
    data_evento DATETIME NOT NULL,
    local VARCHAR(150),
    vagas_totais INT NOT NULL,
    id_categoria INT,
    status VARCHAR(30) NOT NULL DEFAULT 'Planejado',
    imagem_url VARCHAR(500),

    CONSTRAINT fk_evento_categoria
        FOREIGN KEY (id_categoria)
        REFERENCES categoria(id_categoria),

    CONSTRAINT ck_evento_vagas
        CHECK (vagas_totais > 0),

    -- Estados do Diagrama de Estados (seção 3.10)
    CONSTRAINT ck_evento_status
        CHECK (status IN (
            'Planejado',
            'Inscrições Abertas',
            'Inscrições Encerradas',
            'Em Andamento',
            'Concluído',
            'Cancelado'
        ))
) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- 4. Tabela: aluno
-- ------------------------------------------------------------
CREATE TABLE aluno (
    id_aluno INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL,
    ra VARCHAR(20) NOT NULL,

    -- Hash da senha (nunca a senha em texto puro).
    senha_hash VARCHAR(255) NOT NULL,

    -- O login só é liberado depois que o aluno confirma o e-mail.
    email_confirmado BOOLEAN NOT NULL DEFAULT FALSE,

    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_aluno_email UNIQUE (email),
    CONSTRAINT uq_aluno_ra UNIQUE (ra)
) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- 5. Tabela: inscricao
-- ------------------------------------------------------------
CREATE TABLE inscricao (
    id_inscricao INT AUTO_INCREMENT PRIMARY KEY,
    id_aluno INT NOT NULL,
    id_evento INT NOT NULL,
    data_inscricao DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Confirmada',

    CONSTRAINT fk_inscricao_aluno
        FOREIGN KEY (id_aluno)
        REFERENCES aluno(id_aluno),

    CONSTRAINT fk_inscricao_evento
        FOREIGN KEY (id_evento)
        REFERENCES evento(id_evento),

    -- RN02: impede o mesmo aluno de se inscrever
    -- duas vezes no mesmo evento.
    CONSTRAINT uq_aluno_evento
        UNIQUE (id_aluno, id_evento),

    CONSTRAINT ck_inscricao_status
        CHECK (status IN ('Confirmada', 'Cancelada'))
) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- 6. Tabela: codigo_verificacao
-- ------------------------------------------------------------
-- Códigos de 6 dígitos enviados por e-mail.
--   CONFIRMACAO -> confirmar o e-mail após o cadastro
--   RECUPERACAO -> redefinir a senha ("Esqueci minha senha")
-- O código é guardado como hash, expira em poucos minutos e
-- aceita um número limitado de tentativas.
CREATE TABLE codigo_verificacao (
    id_codigo INT AUTO_INCREMENT PRIMARY KEY,
    id_aluno INT NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    codigo_hash VARCHAR(255) NOT NULL,
    expira_em DATETIME NOT NULL,
    tentativas INT NOT NULL DEFAULT 0,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_codigo_aluno
        FOREIGN KEY (id_aluno)
        REFERENCES aluno(id_aluno)
        ON DELETE CASCADE,

    CONSTRAINT ck_codigo_tipo
        CHECK (tipo IN ('CONFIRMACAO', 'RECUPERACAO'))
) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- 7. View: vw_evento_vagas
-- ------------------------------------------------------------
-- Eventos com categoria, inscritos e vagas disponíveis.
-- Só contam as inscrições com status 'Confirmada' (RN01).
CREATE VIEW vw_evento_vagas AS
SELECT
    e.id_evento,
    e.titulo,
    e.descricao,
    e.data_evento,
    e.local,
    e.vagas_totais,
    e.status,
    e.imagem_url,
    c.id_categoria,
    c.nome AS categoria,
    COUNT(i.id_inscricao) AS inscritos,
    e.vagas_totais - COUNT(i.id_inscricao) AS vagas_disponiveis
FROM evento e
LEFT JOIN categoria c
    ON c.id_categoria = e.id_categoria
LEFT JOIN inscricao i
    ON i.id_evento = e.id_evento
   AND i.status = 'Confirmada'
GROUP BY
    e.id_evento,
    c.id_categoria,
    c.nome;


-- ============================================================
-- 8. Dados de exemplo
-- ============================================================
-- Categorias e eventos iguais aos do protótipo do front-end.
-- Datas futuras para que os eventos apareçam abertos na
-- apresentação.

INSERT INTO categoria (nome) VALUES
    ('Tecnologia'),
    ('Carreira'),
    ('Acadêmico'),
    ('Criatividade');


INSERT INTO evento
    (titulo, descricao, data_evento, local, vagas_totais, id_categoria, status, imagem_url)
VALUES
(
    'IA Generativa na Prática',
    'Uma introdução prática às possibilidades da inteligência artificial generativa no ambiente acadêmico e profissional.',
    '2026-11-05 19:00:00', 'Auditório 01', 100,
    (SELECT id_categoria FROM categoria WHERE nome = 'Tecnologia'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=85'
),
(
    'Carreira & Primeiro Emprego',
    'Estratégias para entrar no mercado, construir currículo e desenvolver uma carreira profissional.',
    '2026-11-07 18:30:00', 'Sala Magna', 80,
    (SELECT id_categoria FROM categoria WHERE nome = 'Carreira'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=85'
),
(
    'Semana de Desenvolvimento Web',
    'Uma experiência dedicada ao desenvolvimento web moderno, interfaces e novas tecnologias.',
    '2026-11-10 19:00:00', 'Laboratório 04', 60,
    (SELECT id_categoria FROM categoria WHERE nome = 'Tecnologia'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=85'
),
(
    'Comunicação e Apresentações',
    'Aprenda técnicas para apresentar ideias com clareza, confiança e impacto.',
    '2026-11-12 20:00:00', 'Auditório 02', 100,
    (SELECT id_categoria FROM categoria WHERE nome = 'Acadêmico'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=85'
),
(
    'Design, Criatividade & Tecnologia',
    'Como criatividade, design e tecnologia podem trabalhar juntos para criar experiências melhores.',
    '2026-11-18 19:00:00', 'Espaço Inovação', 70,
    (SELECT id_categoria FROM categoria WHERE nome = 'Criatividade'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1200&q=85'
),
(
    'Dados e o Futuro das Profissões',
    'Uma conversa sobre dados, transformação digital e as novas oportunidades profissionais.',
    '2026-11-24 18:00:00', 'Auditório 01', 100,
    (SELECT id_categoria FROM categoria WHERE nome = 'Acadêmico'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=85'
),
(
    -- Evento com poucas vagas para demonstrar a RN03:
    -- 3 vagas e 2 inscritos. A próxima inscrição encerra o evento.
    'Workshop de Python para Iniciantes',
    'Workshop prático de Python: variáveis, listas, funções e um mini projeto com dados. Traga seu notebook.',
    '2026-11-26 19:00:00', 'Laboratório 02', 3,
    (SELECT id_categoria FROM categoria WHERE nome = 'Tecnologia'),
    'Inscrições Abertas',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=85'
),
(
    -- Evento ainda não publicado: só a coordenação enxerga.
    'Semana Acadêmica de ADS 2026',
    'Uma semana de palestras, oficinas e apresentações de projetos dos alunos de Análise e Desenvolvimento de Sistemas.',
    '2026-12-01 19:00:00', 'Auditório Principal', 200,
    (SELECT id_categoria FROM categoria WHERE nome = 'Acadêmico'),
    'Planejado',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=85'
);


-- ------------------------------------------------------------
-- Alunos de exemplo (e-mail já confirmado)
-- Senha de teste dos dois: Teste@123
-- ------------------------------------------------------------
INSERT INTO aluno (nome, email, ra, senha_hash, email_confirmado) VALUES
(
    'João da Silva', 'joao.teste@email.com', 'RA2026001',
    'scrypt:32768:8:1$Mn3SZwyAKGmfPHZz$927e9b546d2b5daa13b68b155c5c817c032541f13f8bb4dadb700809ac0c96225448a797ad774680a951b8b78d02f99b686d2940a81698c6b02f725053878875',
    TRUE
),
(
    'Maria Oliveira', 'maria.teste@email.com', 'RA2026002',
    'scrypt:32768:8:1$Mn3SZwyAKGmfPHZz$927e9b546d2b5daa13b68b155c5c817c032541f13f8bb4dadb700809ac0c96225448a797ad774680a951b8b78d02f99b686d2940a81698c6b02f725053878875',
    TRUE
);


-- ------------------------------------------------------------
-- Inscrições de exemplo
-- ------------------------------------------------------------
INSERT INTO inscricao (id_aluno, id_evento)
SELECT a.id_aluno, e.id_evento
FROM aluno a
JOIN evento e
    ON e.titulo IN ('Workshop de Python para Iniciantes', 'IA Generativa na Prática')
WHERE a.ra = 'RA2026001';

INSERT INTO inscricao (id_aluno, id_evento)
SELECT a.id_aluno, e.id_evento
FROM aluno a
JOIN evento e
    ON e.titulo = 'Workshop de Python para Iniciantes'
WHERE a.ra = 'RA2026002';


-- ============================================================
-- 9. Consultas úteis
-- ============================================================

-- Eventos visíveis para os alunos (RF01):
--
-- SELECT *
-- FROM vw_evento_vagas
-- WHERE status IN ('Inscrições Abertas', 'Em Andamento')
-- ORDER BY data_evento;

-- Inscrições de um aluno pelo RA (RF07):
--
-- SELECT e.titulo, e.data_evento, e.local, i.status, i.data_inscricao
-- FROM inscricao i
-- JOIN aluno a  ON a.id_aluno = i.id_aluno
-- JOIN evento e ON e.id_evento = i.id_evento
-- WHERE a.ra = 'RA2026001'
-- ORDER BY e.data_evento;


-- ============================================================
-- 10. Observações para integração
-- ============================================================
-- Database: eventofacil
-- SGBD: MySQL 8.0.16+
--
-- Tabelas:
--   categoria, evento, aluno, inscricao, codigo_verificacao
-- View:
--   vw_evento_vagas
--
-- Relacionamentos:
--   evento.id_categoria            -> categoria.id_categoria
--   inscricao.id_aluno             -> aluno.id_aluno
--   inscricao.id_evento            -> evento.id_evento
--   codigo_verificacao.id_aluno    -> aluno.id_aluno
--
-- Regras reforçadas no banco:
--   UNIQUE (id_aluno, id_evento)      -> RN02
--   UNIQUE (ra), UNIQUE (email)       -> identificação única do aluno
--   CHECK  (status do evento)         -> Diagrama de Estados
--
-- Regras tratadas no Backend (dentro de transação com
-- SELECT ... FOR UPDATE, para evitar duas inscrições na última vaga):
--   RN01 - só inscreve se houver vaga
--   RN03 - muda o status para 'Inscrições Encerradas' ao lotar
--   RN04 - só a coordenação cria/edita/cancela eventos
--
-- Importante:
--   A senha do usuário root NÃO deve ser colocada neste arquivo.
--   O Backend usa credenciais próprias em variáveis de ambiente (.env).
-- ============================================================
