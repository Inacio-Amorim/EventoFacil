/* =========================================================
   EVENTOFÁCIL - ÁREA DA COORDENAÇÃO (RF08 / RN04)

   Criar, editar, publicar, encerrar e cancelar eventos,
   ver os inscritos e criar categorias.
   Todas as regras são validadas também no backend.
========================================================= */


/* =========================================================
   ESTADO
========================================================= */

const API_URL = "/api";

let allEvents = [];

let categories = [];

let transitions = {};

let editingEventId = null;

let confirmAction = null;

const STATUS_CSS = {
    "Planejado": "planejado",
    "Inscrições Abertas": "abertas",
    "Inscrições Encerradas": "encerradas",
    "Em Andamento": "andamento",
    "Concluído": "concluido",
    "Cancelado": "cancelado"
};

// Texto do botão para cada mudança de status (Diagrama de Estados)
const TRANSITION_LABELS = {
    "Inscrições Abertas": "Abrir inscrições",
    "Inscrições Encerradas": "Encerrar inscrições",
    "Em Andamento": "Iniciar evento",
    "Concluído": "Concluir"
};


/* =========================================================
   API
========================================================= */

class ApiError extends Error {

    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data || {};
    }
}


async function api(path, options = {}) {

    const config = {
        method: options.method || "GET",
        headers: {},
        credentials: "same-origin"
    };

    if (options.body !== undefined) {
        config.headers["Content-Type"] = "application/json";
        config.body = JSON.stringify(options.body);
    }

    let response;

    try {
        response = await fetch(API_URL + path, config);
    }
    catch (error) {
        throw new ApiError("Não foi possível conectar ao servidor.", 0);
    }

    let data = {};

    try {
        data = await response.json();
    }
    catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new ApiError(data.erro || "Erro inesperado.", response.status, data);
    }

    return data;
}


/* =========================================================
   UTILITÁRIOS
========================================================= */

function escapeHtml(text) {

    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


function formatDate(iso) {

    const date = new Date(iso);

    return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }) + " às " + date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}


function showToast(message, type = "success") {

    const container = document.getElementById("toastContainer");

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}


function setFieldError(inputId, message) {

    const input = document.getElementById(inputId);

    const error = document.getElementById(`${inputId}Error`);

    if (input) {
        input.closest(".field")?.classList.add("error");
    }

    if (error) {
        error.textContent = message;
    }
}


function clearErrors(container = document) {

    container.querySelectorAll(".field").forEach(field => field.classList.remove("error"));

    container.querySelectorAll(".field-error").forEach(error => {
        error.textContent = "";
    });
}


function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
}


function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
}


function setLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);
}


/* =========================================================
   LOGIN / LOGOUT
========================================================= */

document
    .getElementById("adminLoginForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors();

        const password = document.getElementById("adminPassword").value;

        if (!password) {
            setFieldError("adminPassword", "Digite a senha da coordenação.");
            return;
        }

        const button = event.target.querySelector("[type='submit']");

        setLoading(button, true);

        try {
            await api("/admin/login", { method: "POST", body: { senha: password } });
            document.getElementById("adminPassword").value = "";
            await openPanel();
        }
        catch (error) {
            setFieldError("adminPassword", error.message);
        }
        finally {
            setLoading(button, false);
        }
    });


document
    .getElementById("adminLogout")
    .addEventListener("click", async () => {

        try {
            await api("/admin/logout", { method: "POST" });
        }
        catch (error) {
            // segue para a tela de login mesmo assim
        }

        document.getElementById("adminPanel").classList.add("hidden");

        document.getElementById("adminLogin").classList.remove("hidden");
    });


async function openPanel() {

    document.getElementById("adminLogin").classList.add("hidden");

    document.getElementById("adminPanel").classList.remove("hidden");

    const status = await api("/admin/status");

    transitions = status.transicoes;

    const filter = document.getElementById("statusFilter");

    filter.innerHTML = '<option value="">Todos</option>' +
        status.status.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    await Promise.all([loadCategories(), loadEvents()]);
}


/* =========================================================
   DADOS
========================================================= */

async function loadCategories() {

    categories = await api("/categorias");

    document.getElementById("fCategoria").innerHTML =
        categories
            .map(c => `<option value="${c.id_categoria}">${escapeHtml(c.nome)}</option>`)
            .join("");
}


async function loadEvents() {

    try {
        allEvents = await api("/admin/eventos");
        renderStats();
        renderEvents();
    }
    catch (error) {

        if (error.status === 403) {
            document.getElementById("adminPanel").classList.add("hidden");
            document.getElementById("adminLogin").classList.remove("hidden");
        }

        showToast(error.message, "error");
    }
}


/* =========================================================
   RENDERIZAÇÃO
========================================================= */

function renderStats() {

    const active = allEvents.filter(e => e.status !== "Cancelado");

    const stats = [
        [active.length, "eventos ativos"],
        [allEvents.filter(e => e.status === "Inscrições Abertas").length, "com inscrições abertas"],
        [active.reduce((total, e) => total + e.inscritos, 0), "inscrições confirmadas"],
        [allEvents.filter(e => e.status === "Inscrições Encerradas").length, "eventos lotados / encerrados"]
    ];

    document.getElementById("adminStats").innerHTML = stats
        .map(([value, label]) => `<div class="admin-stat"><strong>${value}</strong><span>${label}</span></div>`)
        .join("");
}


function renderEvents() {

    const filter = document.getElementById("statusFilter").value;

    const list = document.getElementById("adminEvents");

    const filtered = allEvents.filter(e => !filter || e.status === filter);

    if (!filtered.length) {
        list.innerHTML = `
            <div class="empty-state">
                <strong>Nenhum evento encontrado.</strong>
                Crie um evento no botão "Novo evento".
            </div>`;
        return;
    }

    list.innerHTML = "";

    filtered.forEach(event => {

        const item = document.createElement("article");

        item.className = "admin-event";

        const image = event.imagem_url
            ? `background-image: url('${escapeHtml(event.imagem_url).replace(/'/g, "%27")}')`
            : "";

        const editable = !["Concluído", "Cancelado"].includes(event.status);

        const nextStatus = (transitions[event.status] || []).filter(s => s !== "Cancelado");

        item.innerHTML = `
            <div class="admin-event-image" style="${image}"></div>

            <div>
                <span class="status-badge ${STATUS_CSS[event.status] || ""}">${escapeHtml(event.status)}</span>
                <h3>${escapeHtml(event.titulo)}</h3>
                <div class="admin-event-meta">
                    <span>◷ ${formatDate(event.data_evento)}</span>
                    <span>⌖ ${escapeHtml(event.local || "-")}</span>
                    <span>${escapeHtml(event.categoria || "-")}</span>
                    <span><strong>${event.inscritos}</strong> / ${event.vagas_totais} vagas ocupadas</span>
                </div>
            </div>

            <div class="admin-event-actions">
                ${nextStatus.map(s =>
                    `<button class="admin-action primary" data-action="status" data-status="${escapeHtml(s)}">${TRANSITION_LABELS[s] || s}</button>`
                ).join("")}
                <button class="admin-action" data-action="attendees">Inscritos (${event.inscritos})</button>
                ${editable ? '<button class="admin-action" data-action="edit">Editar</button>' : ""}
                ${editable ? '<button class="admin-action danger" data-action="cancel">Cancelar evento</button>' : ""}
            </div>
        `;

        item.querySelector(".admin-event-actions").addEventListener("click", clickEvent => {

            const button = clickEvent.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const action = button.dataset.action;

            if (action === "edit") openEventForm(event);
            if (action === "attendees") showAttendees(event);
            if (action === "status") changeStatus(event, button.dataset.status);
            if (action === "cancel") cancelEvent(event);
        });

        list.appendChild(item);
    });
}


document.getElementById("statusFilter").addEventListener("change", renderEvents);


/* =========================================================
   CRIAR / EDITAR EVENTO
========================================================= */

function toLocalInput(iso) {
    // "2026-11-05T19:00" já está no formato do <input type="datetime-local">
    return (iso || "").slice(0, 16);
}


function openEventForm(event = null) {

    editingEventId = event ? event.id_evento : null;

    clearErrors(document.getElementById("eventForm"));

    document.getElementById("eventFormTitle").textContent = event ? "Editar evento" : "Novo evento";

    document.getElementById("fTitulo").value = event ? event.titulo : "";
    document.getElementById("fDescricao").value = event ? (event.descricao || "") : "";
    document.getElementById("fData").value = event ? toLocalInput(event.data_evento) : "";
    document.getElementById("fVagas").value = event ? event.vagas_totais : "";
    document.getElementById("fLocal").value = event ? (event.local || "") : "";
    document.getElementById("fImagem").value = event ? (event.imagem_url || "") : "";
    document.getElementById("fStatus").value = "Planejado";

    if (event && event.id_categoria) {
        document.getElementById("fCategoria").value = event.id_categoria;
    }

    // A situação só é escolhida na criação; depois muda pelos botões de status
    document.getElementById("fStatusField").classList.toggle("hidden", Boolean(event));

    openModal("eventFormModal");

    setTimeout(() => document.getElementById("fTitulo").focus(), 50);
}


document.getElementById("newEventButton").addEventListener("click", () => openEventForm());


document
    .getElementById("eventForm")
    .addEventListener("submit", async submitEvent => {

        submitEvent.preventDefault();

        clearErrors(submitEvent.target);

        const body = {
            titulo: document.getElementById("fTitulo").value.trim(),
            descricao: document.getElementById("fDescricao").value.trim(),
            data_evento: document.getElementById("fData").value,
            vagas_totais: document.getElementById("fVagas").value,
            local: document.getElementById("fLocal").value.trim(),
            id_categoria: document.getElementById("fCategoria").value,
            imagem_url: document.getElementById("fImagem").value.trim()
        };

        if (!editingEventId) {
            body.status = document.getElementById("fStatus").value;
        }

        const button = submitEvent.target.querySelector("[type='submit']");

        setLoading(button, true);

        try {

            const data = editingEventId
                ? await api(`/admin/eventos/${editingEventId}`, { method: "PUT", body })
                : await api("/admin/eventos", { method: "POST", body });

            closeModal("eventFormModal");

            showToast(data.mensagem);

            await loadEvents();
        }
        catch (error) {

            const fieldIds = {
                titulo: "fTitulo",
                descricao: "fDescricao",
                data_evento: "fData",
                vagas_totais: "fVagas",
                local: "fLocal",
                id_categoria: "fCategoria",
                imagem_url: "fImagem"
            };

            if (fieldIds[error.data.campo]) {
                setFieldError(fieldIds[error.data.campo], error.message);
            }
            else {
                showToast(error.message, "error");
            }
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   STATUS / CANCELAMENTO
========================================================= */

function askConfirmation(title, text, action) {

    document.getElementById("adminConfirmTitle").textContent = title;

    document.getElementById("adminConfirmText").textContent = text;

    confirmAction = action;

    openModal("adminConfirmModal");
}


document.getElementById("adminConfirmYes").addEventListener("click", async () => {

    const action = confirmAction;

    confirmAction = null;

    closeModal("adminConfirmModal");

    if (action) {
        await action();
    }
});


document.getElementById("adminConfirmNo").addEventListener("click", () => {

    confirmAction = null;

    closeModal("adminConfirmModal");
});


function changeStatus(event, status) {

    askConfirmation(
        `${TRANSITION_LABELS[status] || status}?`,
        `"${event.titulo}" passará de "${event.status}" para "${status}".`,
        async () => {
            try {
                const data = await api(`/admin/eventos/${event.id_evento}/status`, {
                    method: "PATCH",
                    body: { status }
                });
                showToast(data.mensagem);
            }
            catch (error) {
                showToast(error.message, "error");
            }
            await loadEvents();
        }
    );
}


function cancelEvent(event) {

    askConfirmation(
        "Cancelar evento?",
        `"${event.titulo}" será cancelado e deixará de aparecer para os alunos. Esta ação não pode ser desfeita.`,
        async () => {
            try {
                await api(`/admin/eventos/${event.id_evento}`, { method: "DELETE" });
                showToast("Evento cancelado.");
            }
            catch (error) {
                showToast(error.message, "error");
            }
            await loadEvents();
        }
    );
}


/* =========================================================
   INSCRITOS
========================================================= */

async function showAttendees(event) {

    document.getElementById("attendeesTitle").textContent = event.titulo;

    const list = document.getElementById("attendeesList");

    list.innerHTML = "Carregando...";

    openModal("attendeesModal");

    try {

        const attendees = await api(`/admin/eventos/${event.id_evento}/inscritos`);

        list.innerHTML = attendees.length
            ? attendees.map(a => `
                <div class="admin-attendee">
                    <strong>${escapeHtml(a.nome)}</strong>
                    <span>RA ${escapeHtml(a.ra)}</span>
                    <span>${escapeHtml(a.email)}</span>
                    <span>${formatDate(a.data_inscricao)}</span>
                </div>`).join("")
            : '<div class="empty-state"><strong>Nenhum inscrito ainda.</strong></div>';
    }
    catch (error) {
        list.textContent = error.message;
    }
}


/* =========================================================
   CATEGORIAS
========================================================= */

document.getElementById("newCategoryButton").addEventListener("click", () => {

    clearErrors(document.getElementById("categoryForm"));

    document.getElementById("categoryName").value = "";

    openModal("categoryModal");

    setTimeout(() => document.getElementById("categoryName").focus(), 50);
});


document
    .getElementById("categoryForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors(event.target);

        const name = document.getElementById("categoryName").value.trim();

        if (!name) {
            setFieldError("categoryName", "Digite o nome da categoria.");
            return;
        }

        try {
            await api("/admin/categorias", { method: "POST", body: { nome: name } });
            closeModal("categoryModal");
            showToast("Categoria criada.");
            await loadCategories();
        }
        catch (error) {
            setFieldError("categoryName", error.message);
        }
    });


/* =========================================================
   MODAIS
========================================================= */

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.close));
});


document.querySelectorAll(".modal-overlay").forEach(overlay => {

    overlay.addEventListener("click", event => {

        if (event.target === overlay) {
            overlay.classList.add("hidden");
            confirmAction = null;
        }
    });
});


document.addEventListener("keydown", event => {

    if (event.key === "Escape") {
        document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden"));
        confirmAction = null;
    }
});


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

(async function init() {

    try {

        const session = await api("/admin/sessao");

        if (session.coordenacao) {
            await openPanel();
        }
    }
    catch (error) {
        showToast(error.message, "error");
    }
})();
