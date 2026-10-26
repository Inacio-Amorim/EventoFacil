/* =========================================================
   EVENTOFÁCIL 2.0
   Frontend integrado ao backend

   Frontend (HTML / CSS / JavaScript)
       ↓  fetch + JSON (cookie de sessão)
   Backend Python / Flask   ->   /api/...
       ↓
   MySQL   +   Azure AI Foundry (agente-eventofacil)

   O navegador NÃO guarda senhas, inscrições nem a chave
   da IA. Tudo isso fica no backend (RNF05 / LGPD).
========================================================= */


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const API_URL = "/api";

// Atualiza as vagas na tela a cada 30 segundos (RF01 - tempo real)
const EVENTS_REFRESH_MS = 30000;

const DEFAULT_EVENT_IMAGE =
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=85";

const MONTHS_SHORT = [
    "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
    "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"
];

const MONTHS_LONG = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

const STATUS_OPEN = "Inscrições Abertas";
const STATUS_RUNNING = "Em Andamento";


/* =========================================================
   ESTADO
========================================================= */

let currentUser = null;

let currentEvent = null;

let currentCategory = "Todos";

let events = [];

let editingField = null;

let hasUnsavedChanges = false;

let pendingConfirmEmail = null;

let recoveryEmail = null;

let codeTimers = {};

let eventsRefreshTimer = null;

let chatConversationId = null;

let chatBusy = false;

let confirmCallback = null;


/* =========================================================
   ELEMENTOS
========================================================= */

const authScreen = document.getElementById("authScreen");

const mainScreen = document.getElementById("mainScreen");

const authViews = document.querySelectorAll(".auth-view");

const eventsGrid = document.getElementById("eventsGrid");

const registrationsList = document.getElementById("registrationsList");

const chatMessages = document.getElementById("chatMessages");

const chatForm = document.getElementById("chatForm");

const chatInput = document.getElementById("chatInput");

const chatSend = document.getElementById("chatSend");

const chatSuggestions = document.getElementById("chatSuggestions");


/* =========================================================
   COMUNICAÇÃO COM A API
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
        throw new ApiError(
            "Não foi possível conectar ao servidor. Verifique se o backend está rodando.",
            0
        );
    }

    let data = {};

    try {
        data = await response.json();
    }
    catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new ApiError(
            data.erro || "Erro inesperado. Tente novamente.",
            response.status,
            data
        );
    }

    return data;
}


/*
    Mostra o erro da API no campo certo do formulário.
    fieldMap: { campoDaApi: ["idDoInput", "idDoErro"] }
*/
function showApiError(error, fieldMap = {}) {

    const target = fieldMap[error.data.campo];

    if (target) {
        setFieldError(target[0], target[1], error.message);
    }
    else {
        showToast(error.message, "error");
    }

    shakeScreen();
}


function setLoading(button, loading) {

    if (!button) {
        return;
    }

    button.disabled = loading;

    button.classList.toggle("is-loading", loading);
}


function submitButton(form) {
    return form.querySelector("[type='submit']");
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


function pad(number) {
    return String(number).padStart(2, "0");
}


function firstName(name) {
    return (name || "").split(" ")[0];
}


/*
    Converte o evento que vem da API para o formato
    que as telas do protótipo já usavam.
*/
function mapEvent(item) {

    const date = new Date(item.data_evento);

    return {
        id: item.id_evento,
        title: item.titulo,
        category: item.categoria || "Geral",
        date: `${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}`,
        fullDate: `${date.getDate()} de ${MONTHS_LONG[date.getMonth()]} de ${date.getFullYear()}`,
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
        location: item.local || "A definir",
        capacity: item.inscritos,
        totalCapacity: item.vagas_totais,
        available: item.vagas_disponiveis,
        status: item.status,
        description: item.descricao || "",
        image: item.imagem_url || DEFAULT_EVENT_IMAGE,
        registered: Boolean(item.inscrito)
    };
}


function canRegister(event) {
    return event.status === STATUS_OPEN && event.available > 0;
}


/* =========================================================
   NAVEGAÇÃO ENTRE TELAS
========================================================= */

function showAuthView(viewId) {

    authViews.forEach(view => {
        view.classList.remove("active");
    });

    const target = document.getElementById(viewId);

    if (target) {
        target.classList.add("active");
    }
}


async function openMainScreen(user) {

    currentUser = user;

    authScreen.classList.add("hidden");

    mainScreen.classList.remove("hidden");

    updateProfileUI();

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });

    await Promise.all([
        loadCategories(),
        loadEvents(),
        renderRegistrations()
    ]);

    startEventsRefresh();

    checkAssistantStatus();
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

    try {
        await api("/auth/logout", { method: "POST" });
    }
    catch (error) {
        // Mesmo sem resposta do servidor, sai da tela
    }

    currentUser = null;

    stopEventsRefresh();

    resetChat();

    mainScreen.classList.add("hidden");

    authScreen.classList.remove("hidden");

    showAuthView("authChoice");

    clearForms();

    showToast("Você saiu da sua conta.", "success");
}


/* =========================================================
   LIMPAR FORMULÁRIOS
========================================================= */

function clearForms() {

    document
        .querySelectorAll("input")
        .forEach(input => {

            if (
                input.type !== "button" &&
                input.type !== "submit"
            ) {
                input.value = "";
            }
        });

    clearErrors();
}


function clearErrors() {

    document
        .querySelectorAll(".field")
        .forEach(field => {
            field.classList.remove("error");
        });

    document
        .querySelectorAll(".field-error")
        .forEach(error => {
            error.textContent = "";
        });
}


/* =========================================================
   ERRO EM CAMPO
========================================================= */

function setFieldError(inputId, errorId, message) {

    const input = document.getElementById(inputId);

    const error = document.getElementById(errorId);

    if (!input || !error) {
        return;
    }

    const field = input.closest(".field");

    if (field) {
        field.classList.add("error");
    }

    error.textContent = message;
}


/* =========================================================
   ANIMAÇÃO DE ERRO NA TELA
========================================================= */

function shakeScreen() {

    document.body.classList.remove("screen-shake");

    void document.body.offsetWidth;

    document.body.classList.add("screen-shake");
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message, type = "success") {

    const container = document.getElementById("toastContainer");

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {

        toast.style.opacity = "0";

        toast.style.transform = "translateX(30px)";

        setTimeout(() => {
            toast.remove();
        }, 300);

    }, 3500);
}


/* =========================================================
   VALIDAÇÕES
========================================================= */

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function isValidRa(ra) {
    return /^[A-Za-z0-9-]{4,20}$/.test(ra);
}

/*
    IMPORTANTE:
    A validação no navegador só melhora a experiência.
    O backend valida tudo de novo e confirma que o e-mail
    existe enviando um código de 6 dígitos.
*/


/* =========================================================
   LOGIN
========================================================= */

document
    .getElementById("loginForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors();

        const email = document
            .getElementById("loginEmail")
            .value
            .trim()
            .toLowerCase();

        const password = document
            .getElementById("loginPassword")
            .value;

        let hasError = false;

        if (!email) {
            setFieldError("loginEmail", "loginEmailError", "Digite seu e-mail.");
            hasError = true;
        }
        else if (!isValidEmail(email)) {
            setFieldError("loginEmail", "loginEmailError", "Digite um e-mail válido.");
            hasError = true;
        }

        if (!password) {
            setFieldError("loginPassword", "loginPasswordError", "Digite sua senha.");
            hasError = true;
        }

        if (hasError) {
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            const data = await api("/auth/login", {
                method: "POST",
                body: { email, senha: password }
            });

            await openMainScreen(data.aluno);

            showToast(`Bem-vindo, ${firstName(data.aluno.nome)}!`, "success");
        }
        catch (error) {

            // Conta criada, mas e-mail ainda não confirmado
            if (
                error.status === 403 &&
                error.data.codigo === "EMAIL_NAO_CONFIRMADO"
            ) {
                openConfirmEmailView(email, error.data.expira_em_segundos, error.data.codigo_demo);
                showToast("Confirme seu e-mail para entrar. Enviamos um novo código.", "error");
                return;
            }

            showApiError(error, {
                email: ["loginEmail", "loginEmailError"],
                senha: ["loginPassword", "loginPasswordError"]
            });
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   CADASTRO
========================================================= */

document
    .getElementById("registerForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors();

        const name = document.getElementById("registerName").value.trim();

        const email = document
            .getElementById("registerEmail")
            .value
            .trim()
            .toLowerCase();

        const ra = document
            .getElementById("registerRa")
            .value
            .trim()
            .toUpperCase();

        const password = document.getElementById("registerPassword").value;

        const confirmPassword = document.getElementById("registerPasswordConfirm").value;

        let hasError = false;

        if (!name) {
            setFieldError("registerName", "registerNameError", "Digite seu nome completo.");
            hasError = true;
        }
        else if (name.split(" ").filter(Boolean).length < 2) {
            setFieldError("registerName", "registerNameError", "Digite nome e sobrenome.");
            hasError = true;
        }

        if (!email) {
            setFieldError("registerEmail", "registerEmailError", "Digite seu e-mail.");
            hasError = true;
        }
        else if (!isValidEmail(email)) {
            setFieldError("registerEmail", "registerEmailError", "E-mail inválido.");
            hasError = true;
        }

        if (!ra) {
            setFieldError("registerRa", "registerRaError", "Digite seu RA.");
            hasError = true;
        }
        else if (!isValidRa(ra)) {
            setFieldError("registerRa", "registerRaError", "Use de 4 a 20 letras, números ou hífen.");
            hasError = true;
        }

        if (!password) {
            setFieldError("registerPassword", "registerPasswordError", "Digite uma senha.");
            hasError = true;
        }
        else if (password.length < 6) {
            setFieldError("registerPassword", "registerPasswordError", "A senha deve ter pelo menos 6 caracteres.");
            hasError = true;
        }

        if (!confirmPassword) {
            setFieldError("registerPasswordConfirm", "registerPasswordConfirmError", "Confirme sua senha.");
            hasError = true;
        }
        else if (password !== confirmPassword) {
            setFieldError("registerPasswordConfirm", "registerPasswordConfirmError", "As senhas não são iguais.");
            hasError = true;
        }

        if (hasError) {
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            const data = await api("/auth/cadastro", {
                method: "POST",
                body: { nome: name, email, ra, senha: password }
            });

            openConfirmEmailView(data.email, data.expira_em_segundos, data.codigo_demo);

            showToast("Conta criada! Enviamos um código para o seu e-mail.", "success");
        }
        catch (error) {

            showApiError(error, {
                nome: ["registerName", "registerNameError"],
                email: ["registerEmail", "registerEmailError"],
                ra: ["registerRa", "registerRaError"],
                senha: ["registerPassword", "registerPasswordError"]
            });
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   CÓDIGO DE 6 DÍGITOS
   (confirmação de e-mail e recuperação de senha)
========================================================= */

document
    .querySelectorAll(".code-inputs")
    .forEach(group => {

        const inputs = Array.from(group.querySelectorAll("input"));

        inputs.forEach((input, index) => {

            input.addEventListener("input", () => {

                input.value = input.value.replace(/\D/g, "").slice(-1);

                if (input.value && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });

            input.addEventListener("keydown", event => {

                if (
                    event.key === "Backspace" &&
                    !input.value &&
                    index > 0
                ) {
                    inputs[index - 1].focus();
                }
            });

            // Permite colar o código inteiro de uma vez
            input.addEventListener("paste", event => {

                const digits = (event.clipboardData.getData("text") || "")
                    .replace(/\D/g, "")
                    .slice(0, inputs.length);

                if (!digits) {
                    return;
                }

                event.preventDefault();

                inputs.forEach((box, i) => {
                    box.value = digits[i] || "";
                });

                inputs[Math.min(digits.length, inputs.length) - 1].focus();
            });
        });
    });


function getCode(group) {

    return Array
        .from(document.querySelectorAll(`[data-code-group="${group}"] input`))
        .map(input => input.value)
        .join("");
}


function clearCode(group) {

    document
        .querySelectorAll(`[data-code-group="${group}"] input`)
        .forEach(input => {
            input.value = "";
        });
}


function focusCode(group) {

    const first = document.querySelector(`[data-code-group="${group}"] input`);

    if (first) {
        setTimeout(() => first.focus(), 50);
    }
}


/* =========================================================
   TIMER DO CÓDIGO
========================================================= */

function startCodeTimer(key, elementId, seconds) {

    stopCodeTimer(key);

    const element = document.getElementById(elementId);

    const end = Date.now() + (seconds || 600) * 1000;

    function updateTimer() {

        const remaining = Math.max(0, end - Date.now());

        const total = Math.floor(remaining / 1000);

        if (remaining <= 0) {
            element.textContent = "Código expirado. Peça um novo código.";
            stopCodeTimer(key);
            return;
        }

        element.textContent =
            `Código válido por ${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
    }

    updateTimer();

    codeTimers[key] = setInterval(updateTimer, 1000);
}


function stopCodeTimer(key) {

    clearInterval(codeTimers[key]);

    delete codeTimers[key];
}


/*
    Modo demonstração: no site publicado sem servidor de e-mail,
    o backend devolve o código para ser exibido na tela.
*/
function showDemoCode(elementId, code) {

    const element = document.getElementById(elementId);

    if (!code) {
        element.classList.add("hidden");
        element.textContent = "";
        return;
    }

    element.innerHTML =
        `Modo demonstração (sem servidor de e-mail).<br>Seu código é <strong>${escapeHtml(code)}</strong>`;

    element.classList.remove("hidden");
}


/* =========================================================
   CONFIRMAÇÃO DE E-MAIL (CADASTRO)
========================================================= */

function openConfirmEmailView(email, seconds, demoCode) {

    pendingConfirmEmail = email;

    document.getElementById("confirmEmailAddress").textContent = email;

    document.getElementById("confirmCodeError").textContent = "";

    clearCode("confirm");

    showAuthView("confirmEmailView");

    startCodeTimer("confirm", "confirmCodeTimer", seconds);

    showDemoCode("confirmDemoCode", demoCode);

    focusCode("confirm");
}


document
    .getElementById("confirmEmailForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        const errorElement = document.getElementById("confirmCodeError");

        errorElement.textContent = "";

        const code = getCode("confirm");

        if (code.length !== 6) {
            errorElement.textContent = "Digite os 6 dígitos do código.";
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            const data = await api("/auth/confirmar-email", {
                method: "POST",
                body: { email: pendingConfirmEmail, codigo: code }
            });

            stopCodeTimer("confirm");

            clearForms();

            await openMainScreen(data.aluno);

            showToast(`E-mail confirmado! Bem-vindo, ${firstName(data.aluno.nome)}!`, "success");
        }
        catch (error) {

            errorElement.textContent = error.message;

            shakeScreen();
        }
        finally {
            setLoading(button, false);
        }
    });


document
    .getElementById("resendConfirmCode")
    .addEventListener("click", async () => {

        try {

            const data = await api("/auth/reenviar-codigo", {
                method: "POST",
                body: { email: pendingConfirmEmail }
            });

            clearCode("confirm");

            startCodeTimer("confirm", "confirmCodeTimer", data.expira_em_segundos);

            showDemoCode("confirmDemoCode", data.codigo_demo);

            focusCode("confirm");

            showToast("Novo código enviado para o seu e-mail.", "success");
        }
        catch (error) {
            showToast(error.message, "error");
        }
    });


/* =========================================================
   RECUPERAÇÃO - EMAIL
========================================================= */

document
    .getElementById("forgotEmailForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors();

        const email = document
            .getElementById("forgotEmail")
            .value
            .trim()
            .toLowerCase();

        if (!email) {
            setFieldError("forgotEmail", "forgotEmailError", "Digite seu e-mail.");
            shakeScreen();
            return;
        }

        if (!isValidEmail(email)) {
            setFieldError("forgotEmail", "forgotEmailError", "Digite um e-mail válido.");
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            const data = await api("/auth/recuperar-senha", {
                method: "POST",
                body: { email }
            });

            recoveryEmail = email;

            clearCode("forgot");

            document.getElementById("forgotCodeError").textContent = "";

            startCodeTimer("forgot", "codeTimer", data.expira_em_segundos);

            showDemoCode("forgotDemoCode", data.codigo_demo);

            showAuthView("forgotCodeView");

            focusCode("forgot");

            showToast("Código de recuperação enviado para o seu e-mail.", "success");
        }
        catch (error) {

            showApiError(error, {
                email: ["forgotEmail", "forgotEmailError"]
            });
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   RECUPERAÇÃO - CONFIRMAR CÓDIGO
========================================================= */

document
    .getElementById("forgotCodeForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        const errorElement = document.getElementById("forgotCodeError");

        errorElement.textContent = "";

        const code = getCode("forgot");

        if (code.length !== 6) {
            errorElement.textContent = "Digite os 6 dígitos do código.";
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            await api("/auth/recuperar-senha/verificar", {
                method: "POST",
                body: { email: recoveryEmail, codigo: code }
            });

            stopCodeTimer("forgot");

            showAuthView("resetPasswordView");
        }
        catch (error) {

            errorElement.textContent = error.message;

            shakeScreen();
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   NOVA SENHA
========================================================= */

document
    .getElementById("resetPasswordForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors();

        const password = document.getElementById("newPassword").value;

        const confirm = document.getElementById("newPasswordConfirm").value;

        let hasError = false;

        if (!password) {
            setFieldError("newPassword", "newPasswordError", "Digite a nova senha.");
            hasError = true;
        }
        else if (password.length < 6) {
            setFieldError("newPassword", "newPasswordError", "A senha deve ter pelo menos 6 caracteres.");
            hasError = true;
        }

        if (!confirm) {
            setFieldError("newPasswordConfirm", "newPasswordConfirmError", "Confirme a nova senha.");
            hasError = true;
        }
        else if (password !== confirm) {
            setFieldError("newPasswordConfirm", "newPasswordConfirmError", "As senhas não são iguais.");
            hasError = true;
        }

        if (hasError) {
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            await api("/auth/recuperar-senha/redefinir", {
                method: "POST",
                body: { senha: password }
            });

            const email = recoveryEmail;

            recoveryEmail = null;

            clearForms();

            document.getElementById("loginEmail").value = email || "";

            showAuthView("loginView");

            showToast("Senha alterada. Faça login novamente.", "success");
        }
        catch (error) {

            showApiError(error, {
                senha: ["newPassword", "newPasswordError"]
            });
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   CATEGORIAS (vêm do banco)
========================================================= */

async function loadCategories() {

    try {

        const categories = await api("/categorias");

        renderCategoryFilters(categories);
    }
    catch (error) {
        showToast(error.message, "error");
    }
}


function renderCategoryFilters(categories) {

    const container = document.getElementById("categoryFilters");

    container
        .querySelectorAll(".category-filter:not([data-category='Todos'])")
        .forEach(button => button.remove());

    categories.forEach(category => {

        const button = document.createElement("button");

        button.className = "category-filter";

        button.dataset.category = category.nome;

        button.textContent = category.nome;

        container.appendChild(button);
    });

    if (!categories.some(category => category.nome === currentCategory)) {
        currentCategory = "Todos";
    }

    container
        .querySelectorAll(".category-filter")
        .forEach(button => {
            button.classList.toggle("active", button.dataset.category === currentCategory);
        });
}


/* =========================================================
   FILTRO CATEGORIA
========================================================= */

document
    .getElementById("categoryFilters")
    .addEventListener("click", event => {

        const button = event.target.closest(".category-filter");

        if (!button) {
            return;
        }

        document
            .querySelectorAll(".category-filter")
            .forEach(item => item.classList.remove("active"));

        button.classList.add("active");

        currentCategory = button.dataset.category;

        renderEvents();
    });


/* =========================================================
   EVENTOS
========================================================= */

async function loadEvents(options = {}) {

    try {

        const data = await api("/eventos");

        events = data.map(mapEvent);

        renderEvents();

        updateHeroNextEvent();
    }
    catch (error) {

        if (options.silent) {
            return;
        }

        eventsGrid.innerHTML = `
            <div class="empty-state">
                <strong>Não foi possível carregar os eventos.</strong>
                ${escapeHtml(error.message)}
            </div>
        `;
    }
}


function startEventsRefresh() {

    stopEventsRefresh();

    eventsRefreshTimer = setInterval(() => {

        if (currentUser && !document.hidden) {
            loadEvents({ silent: true });
        }

    }, EVENTS_REFRESH_MS);
}


function stopEventsRefresh() {
    clearInterval(eventsRefreshTimer);
}


document.addEventListener("visibilitychange", () => {

    if (!document.hidden && currentUser) {
        loadEvents({ silent: true });
    }
});


function capacityLabel(event) {

    if (event.registered) {
        return { text: "Você está inscrito ✓", css: "" };
    }

    if (event.status === STATUS_RUNNING) {
        return { text: "Evento em andamento", css: "closed" };
    }

    if (!canRegister(event)) {
        return { text: "Evento lotado", css: "full" };
    }

    return {
        text: `${event.available} de ${event.totalCapacity} vagas disponíveis`,
        css: ""
    };
}


function renderEvents() {

    const search = document
        .getElementById("eventSearch")
        .value
        .trim()
        .toLowerCase();

    const filtered = events.filter(event => {

        const matchesCategory =
            currentCategory === "Todos" ||
            event.category === currentCategory;

        const matchesSearch =
            event.title.toLowerCase().includes(search) ||
            event.description.toLowerCase().includes(search) ||
            event.category.toLowerCase().includes(search);

        return matchesCategory && matchesSearch;
    });

    eventsGrid.innerHTML = "";

    if (!filtered.length) {

        eventsGrid.innerHTML = `
            <div class="empty-state">
                <strong>Nenhum evento encontrado.</strong>
                Tente outro termo ou categoria.
            </div>
        `;

        return;
    }

    filtered.forEach((event, index) => {

        const capacity = capacityLabel(event);

        const card = document.createElement("article");

        card.className = "event-card";

        card.style.animationDelay = `${index * 70}ms`;

        card.innerHTML = `
            <div class="event-card-image">
                <img
                    src="${escapeHtml(event.image)}"
                    alt="${escapeHtml(event.title)}"
                    loading="lazy"
                >
                <div class="event-card-gradient"></div>
            </div>

            <div class="event-card-content">

                <span class="event-category">
                    ${escapeHtml(event.category)}
                </span>

                <h3>
                    ${escapeHtml(event.title)}
                </h3>

                <p class="event-card-description">
                    ${escapeHtml(event.description)}
                </p>

                <div class="event-meta">
                    <span>◷ ${event.date}</span>
                    <span>◉ ${event.time}</span>
                    <span>⌖ ${escapeHtml(event.location)}</span>
                </div>

                <div class="event-capacity ${capacity.css}">
                    ${capacity.text}
                </div>

            </div>
        `;

        card.addEventListener("click", () => openEventModal(event));

        eventsGrid.appendChild(card);
    });
}


function updateHeroNextEvent() {

    const next = events.find(event => event.status === STATUS_OPEN);

    document.getElementById("heroNextTitle").textContent =
        next ? next.title : "Novos eventos em breve";

    document.getElementById("heroNextDate").textContent =
        next ? `${next.date} · ${next.time}` : "";
}


/* =========================================================
   BUSCA
========================================================= */

document
    .getElementById("eventSearch")
    .addEventListener("input", renderEvents);


/* =========================================================
   MODAL EVENTO
========================================================= */

function openEventModal(event) {

    // Sempre usa a versão mais recente do evento (vagas atualizadas)
    event = events.find(item => item.id === event.id) || event;

    currentEvent = event;

    document.getElementById("modalEventTitle").textContent = event.title;

    document.getElementById("modalEventCategory").textContent = event.category;

    document.getElementById("modalEventDescription").textContent = event.description;

    document.getElementById("modalEventImage").style.backgroundImage =
        `url("${event.image.replace(/"/g, "%22")}")`;

    const vacancies = canRegister(event)
        ? `${event.available} de ${event.totalCapacity} disponíveis`
        : "Esgotadas";

    document.getElementById("modalEventInfo").innerHTML = `
        <div class="modal-info-item">
            <span>Data</span>
            <strong>${event.fullDate}</strong>
        </div>

        <div class="modal-info-item">
            <span>Horário</span>
            <strong>${event.time}</strong>
        </div>

        <div class="modal-info-item">
            <span>Local</span>
            <strong>${escapeHtml(event.location)}</strong>
        </div>

        <div class="modal-info-item">
            <span>Vagas</span>
            <strong>${vacancies}</strong>
        </div>
    `;

    const button = document.getElementById("modalRegisterButton");

    const cancelButton = document.getElementById("modalCancelButton");

    let label = "Inscrever-se <span>→</span>";

    let enabled = true;

    if (event.registered) {
        label = "Você já está inscrito ✓";
        enabled = false;
    }
    else if (event.status === STATUS_RUNNING) {
        label = "Evento em andamento";
        enabled = false;
    }
    else if (!canRegister(event)) {
        label = "Evento lotado";
        enabled = false;
    }

    button.innerHTML = label;

    button.disabled = !enabled;

    button.classList.remove("is-loading");

    button.style.opacity = enabled ? "1" : ".6";

    cancelButton.classList.toggle(
        "hidden",
        !(event.registered && event.status !== STATUS_RUNNING)
    );

    document.getElementById("eventModal").classList.remove("hidden");
}


/* =========================================================
   INSCRIÇÃO (RN01, RN02 e RN03 validadas no backend)
========================================================= */

document
    .getElementById("modalRegisterButton")
    .addEventListener("click", async () => {

        if (!currentUser || !currentEvent) {
            return;
        }

        const button = document.getElementById("modalRegisterButton");

        setLoading(button, true);

        try {

            const data = await api("/inscricoes", {
                method: "POST",
                body: { id_evento: currentEvent.id }
            });

            closeModal("eventModal");

            showToast(data.mensagem, "success");
        }
        catch (error) {

            showToast(error.message, "error");
        }
        finally {

            setLoading(button, false);

            await Promise.all([
                loadEvents(),
                renderRegistrations()
            ]);

            // Se o modal continua aberto (erro), mostra a situação atualizada
            if (!document.getElementById("eventModal").classList.contains("hidden")) {
                openEventModal(currentEvent);
            }
        }
    });


document
    .getElementById("modalCancelButton")
    .addEventListener("click", () => {

        if (currentEvent) {
            askCancelRegistration(currentEvent.id, currentEvent.title);
        }
    });


function askCancelRegistration(eventId, title) {

    askConfirmation(
        {
            label: "INSCRIÇÃO",
            title: "Cancelar inscrição?",
            text: `Você vai liberar sua vaga em "${title}".`,
            confirmText: "Sim, cancelar"
        },
        () => cancelRegistration(eventId)
    );
}


async function cancelRegistration(eventId) {

    try {

        const data = await api(`/inscricoes/${eventId}`, { method: "DELETE" });

        closeModal("eventModal");

        showToast(
            data.evento_reaberto
                ? "Inscrição cancelada. A vaga foi liberada para outros alunos."
                : "Inscrição cancelada.",
            "success"
        );
    }
    catch (error) {
        showToast(error.message, "error");
    }

    await Promise.all([
        loadEvents(),
        renderRegistrations()
    ]);
}


/* =========================================================
   MINHAS INSCRIÇÕES (RF07)
========================================================= */

async function renderRegistrations() {

    if (!currentUser) {
        return;
    }

    let registrations = [];

    try {
        registrations = await api("/inscricoes/minhas");
    }
    catch (error) {

        registrationsList.innerHTML = `
            <div class="empty-state">
                <strong>Não foi possível carregar suas inscrições.</strong>
                ${escapeHtml(error.message)}
            </div>
        `;

        return;
    }

    registrationsList.innerHTML = "";

    if (!registrations.length) {

        registrationsList.innerHTML = `
            <div class="empty-state">
                <strong>Você ainda não possui inscrições.</strong>
                Explore os próximos eventos
                e escolha sua próxima experiência.
            </div>
        `;

        return;
    }

    registrations.forEach(registration => {

        const date = new Date(registration.data_evento);

        const canCancel = ![STATUS_RUNNING, "Concluído"].includes(registration.status_evento);

        const item = document.createElement("div");

        item.className = "registration-item";

        item.innerHTML = `
            <div class="registration-info">
                <h3>${escapeHtml(registration.titulo)}</h3>
                <p>
                    ${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}
                    ·
                    ${pad(date.getHours())}:${pad(date.getMinutes())}
                    ·
                    ${escapeHtml(registration.local || "")}
                </p>
            </div>

            <div class="registration-actions">
                <span class="registration-status">INSCRITO</span>
                ${canCancel ? '<button class="registration-cancel" type="button">CANCELAR</button>' : ""}
            </div>
        `;

        const cancel = item.querySelector(".registration-cancel");

        if (cancel) {
            cancel.addEventListener("click", () => {
                askCancelRegistration(registration.id_evento, registration.titulo);
            });
        }

        registrationsList.appendChild(item);
    });
}


/* =========================================================
   CONFIRMAÇÃO GENÉRICA
========================================================= */

function askConfirmation(options, onConfirm) {

    document.getElementById("confirmModalLabel").textContent = options.label || "CONFIRMAÇÃO";

    document.getElementById("confirmModalTitle").textContent = options.title || "Tem certeza?";

    document.getElementById("confirmModalText").textContent = options.text || "";

    document.getElementById("confirmModalYes").textContent = options.confirmText || "Sim, confirmar";

    confirmCallback = onConfirm;

    document.getElementById("confirmModal").classList.remove("hidden");
}


document
    .getElementById("confirmModalYes")
    .addEventListener("click", async () => {

        const callback = confirmCallback;

        confirmCallback = null;

        closeModal("confirmModal");

        if (callback) {
            await callback();
        }
    });


document
    .getElementById("confirmModalNo")
    .addEventListener("click", () => {

        confirmCallback = null;

        closeModal("confirmModal");
    });


/* =========================================================
   PERFIL
========================================================= */

function getInitials(name) {

    return (name || "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0].toUpperCase())
        .join("");
}


function updateProfileUI() {

    if (!currentUser) {
        return;
    }

    const initials = getInitials(currentUser.nome);

    document.getElementById("profileInitials").textContent = initials;

    document.getElementById("profileLargeInitials").textContent = initials;

    document.getElementById("profileName").textContent = currentUser.nome;

    document.getElementById("profileEmail").textContent = currentUser.email;

    document.getElementById("profileRa").textContent = currentUser.ra;
}


/* =========================================================
   ABRIR PERFIL
========================================================= */

document
    .getElementById("profileButton")
    .addEventListener("click", () => {

        updateProfileUI();

        document.getElementById("profileModal").classList.remove("hidden");
    });


/* =========================================================
   ALTERAR PERFIL
========================================================= */

document
    .querySelectorAll("[data-edit-profile]")
    .forEach(button => {

        button.addEventListener("click", () => {

            editingField = button.dataset.editProfile;

            document.getElementById("reauthEmail").value = currentUser.email;

            document.getElementById("reauthPassword").value = "";

            document.getElementById("reauthError").textContent = "";

            document.getElementById("reauthModal").classList.remove("hidden");
        });
    });


/* =========================================================
   REAUTENTICAÇÃO
========================================================= */

document
    .getElementById("reauthForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        const password = document.getElementById("reauthPassword").value;

        const errorElement = document.getElementById("reauthError");

        errorElement.textContent = "";

        if (!password) {
            errorElement.textContent = "Digite sua senha.";
            shakeScreen();
            return;
        }

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            await api("/perfil/reautenticar", {
                method: "POST",
                body: { senha: password }
            });

            closeModal("reauthModal");

            openEditProfile();
        }
        catch (error) {

            errorElement.textContent = error.message;

            shakeScreen();
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   ABRIR EDITOR
========================================================= */

function openEditProfile() {

    const modal = document.getElementById("editProfileModal");

    const title = document.getElementById("editProfileTitle");

    const label = document.getElementById("newProfileValueLabel");

    const input = document.getElementById("newProfileValue");

    const passwordConfirm = document.getElementById("confirmNewPasswordField");

    input.value = "";

    document.getElementById("confirmNewPassword").value = "";

    passwordConfirm.classList.add("hidden");

    if (editingField === "name") {
        title.textContent = "Alterar nome";
        label.textContent = "Novo nome completo";
        input.type = "text";
        input.placeholder = "Digite seu novo nome";
    }

    if (editingField === "email") {
        title.textContent = "Alterar e-mail";
        label.textContent = "Novo e-mail";
        input.type = "email";
        input.placeholder = "Digite seu novo e-mail";
    }

    if (editingField === "password") {
        title.textContent = "Alterar senha";
        label.textContent = "Nova senha";
        input.type = "password";
        input.placeholder = "Digite sua nova senha";
        passwordConfirm.classList.remove("hidden");
    }

    clearErrors();

    modal.classList.remove("hidden");

    hasUnsavedChanges = true;
}


/* =========================================================
   SALVAR ALTERAÇÃO INDIVIDUAL
========================================================= */

document
    .getElementById("editProfileForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        clearErrors();

        const value = document.getElementById("newProfileValue").value.trim();

        if (!value) {
            setFieldError("newProfileValue", "newProfileValueError", "Preencha este campo.");
            shakeScreen();
            return;
        }

        if (editingField === "email" && !isValidEmail(value)) {
            setFieldError("newProfileValue", "newProfileValueError", "Digite um e-mail válido.");
            shakeScreen();
            return;
        }

        if (
            editingField === "name" &&
            value.split(" ").filter(Boolean).length < 2
        ) {
            setFieldError("newProfileValue", "newProfileValueError", "Digite nome e sobrenome.");
            shakeScreen();
            return;
        }

        if (editingField === "password") {

            if (value.length < 6) {
                setFieldError("newProfileValue", "newProfileValueError", "A senha deve ter pelo menos 6 caracteres.");
                shakeScreen();
                return;
            }

            const confirm = document.getElementById("confirmNewPassword").value;

            if (value !== confirm) {
                setFieldError("confirmNewPassword", "confirmNewPasswordError", "As senhas não são iguais.");
                shakeScreen();
                return;
            }
        }

        const apiField = {
            name: "nome",
            email: "email",
            password: "senha"
        }[editingField];

        const button = submitButton(event.target);

        setLoading(button, true);

        try {

            const data = await api("/perfil", {
                method: "PATCH",
                body: { campo: apiField, valor: value }
            });

            currentUser = data.aluno;

            closeModal("editProfileModal");

            updateProfileUI();

            hasUnsavedChanges = false;

            showToast("Alteração salva com sucesso!", "success");
        }
        catch (error) {

            // A confirmação de senha vale por 5 minutos
            if (error.data.codigo === "REAUTENTICACAO_NECESSARIA") {

                closeModal("editProfileModal");

                document.getElementById("reauthEmail").value = currentUser.email;

                document.getElementById("reauthModal").classList.remove("hidden");

                showToast(error.message, "error");

                return;
            }

            showApiError(error, {
                valor: ["newProfileValue", "newProfileValueError"]
            });
        }
        finally {
            setLoading(button, false);
        }
    });


/* =========================================================
   BOTÃO SALVAR ALTERAÇÕES
========================================================= */

document
    .getElementById("saveProfileChanges")
    .addEventListener("click", () => {

        /*
            Cada alteração já é salva no banco ao ser confirmada.
            Este botão funciona como confirmação final visual.
        */

        hasUnsavedChanges = false;

        closeModal("profileModal");

        showToast("Alterações salvas com sucesso!", "success");
    });


/* =========================================================
   FECHAR PERFIL
========================================================= */

document
    .getElementById("profileCloseButton")
    .addEventListener("click", () => {

        if (hasUnsavedChanges) {
            document.getElementById("unsavedModal").classList.remove("hidden");
            return;
        }

        closeModal("profileModal");
    });


/* =========================================================
   NÃO SAIR
========================================================= */

document
    .getElementById("stayEditing")
    .addEventListener("click", () => {
        closeModal("unsavedModal");
    });


/* =========================================================
   DESCARTAR
========================================================= */

document
    .getElementById("discardChanges")
    .addEventListener("click", () => {

        hasUnsavedChanges = false;

        closeModal("unsavedModal");

        closeModal("editProfileModal");

        closeModal("profileModal");
    });


/* =========================================================
   ASSISTENTE IA (RF04, RF05, RF06)
========================================================= */

function openAssistant() {

    document.getElementById("assistantModal").classList.remove("hidden");

    if (!chatMessages.children.length) {
        addWelcomeMessage();
    }

    setTimeout(() => chatInput.focus(), 100);
}


function addWelcomeMessage() {

    const name = currentUser ? `, ${escapeHtml(firstName(currentUser.nome))}` : "";

    addChatMessage(
        "bot",
        `Olá${name}! Sou o assistente do EventoFácil. ` +
        "Posso te ajudar com datas, locais e vagas dos eventos e " +
        "recomendar eventos de acordo com os seus interesses."
    );
}


function addChatMessage(role, html) {

    const message = document.createElement("div");

    message.className = `chat-message ${role}`;

    message.innerHTML = html;

    chatMessages.appendChild(message);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}


/*
    Formata o texto da IA com segurança:
    escapa o HTML e só depois aplica negrito e quebras de linha.
*/
function formatAiText(text) {

    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/^#{1,6}\s*(.+)$/gm, "<strong>$1</strong>")
        .replace(/^\s*[-*]\s+/gm, "• ")
        .replace(/\n/g, "<br>");
}


function appendEventChips(message, eventIds) {

    const cited = (eventIds || [])
        .map(id => events.find(event => event.id === id))
        .filter(Boolean);

    if (!cited.length) {
        return;
    }

    const chips = document.createElement("div");

    chips.className = "chat-event-chips";

    cited.forEach(event => {

        const chip = document.createElement("button");

        chip.type = "button";

        chip.className = "chat-event-chip";

        chip.textContent = event.registered
            ? `✓ ${event.title}`
            : canRegister(event)
                ? `Ver e inscrever-se: ${event.title}`
                : `Ver: ${event.title}`;

        chip.addEventListener("click", () => openEventModal(event));

        chips.appendChild(chip);
    });

    message.appendChild(chips);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}


async function sendChatMessage(text) {

    text = (text || "").trim();

    if (!text || chatBusy) {
        return;
    }

    chatBusy = true;

    setLoading(chatSend, true);

    chatInput.value = "";

    chatSuggestions.classList.add("hidden");

    addChatMessage("user", escapeHtml(text));

    const answer = addChatMessage(
        "bot",
        '<span class="chat-typing" aria-label="Digitando"><span></span><span></span><span></span></span>'
    );

    try {

        const data = await api("/assistente/perguntar", {
            method: "POST",
            body: {
                mensagem: text,
                conversation_id: chatConversationId
            }
        });

        chatConversationId = data.conversation_id;

        answer.innerHTML =
            formatAiText(data.resposta) +
            `<span class="chat-meta">Respondido em ${data.tempo_segundos.toFixed(1).replace(".", ",")} s</span>`;

        appendEventChips(answer, data.eventos_citados);
    }
    catch (error) {

        answer.classList.add("error");

        answer.textContent = error.message;
    }
    finally {

        chatBusy = false;

        setLoading(chatSend, false);

        chatMessages.scrollTop = chatMessages.scrollHeight;

        chatInput.focus();
    }
}


function resetChat() {

    chatConversationId = null;

    chatMessages.innerHTML = "";

    chatSuggestions.classList.remove("hidden");

    if (!document.getElementById("assistantModal").classList.contains("hidden")) {
        addWelcomeMessage();
    }
}


async function checkAssistantStatus() {

    const status = document.getElementById("assistantStatus");

    try {

        const data = await api("/assistente/status");

        status.classList.toggle("offline", !data.configurado);

        status.lastChild.textContent = data.configurado
            ? " Conectado ao Azure AI Foundry"
            : " Assistente não configurado no servidor (.env)";
    }
    catch (error) {

        status.classList.add("offline");

        status.lastChild.textContent = " Servidor indisponível";
    }
}


document
    .getElementById("openAssistant")
    .addEventListener("click", openAssistant);


chatForm.addEventListener("submit", event => {

    event.preventDefault();

    sendChatMessage(chatInput.value);
});


chatSuggestions.addEventListener("click", event => {

    const button = event.target.closest("[data-suggestion]");

    if (button) {
        sendChatMessage(button.dataset.suggestion);
    }
});


document
    .getElementById("chatReset")
    .addEventListener("click", resetChat);


/* =========================================================
   MODAIS
========================================================= */

function closeModal(id) {

    const modal = document.getElementById(id);

    if (modal) {
        modal.classList.add("hidden");
    }
}


document
    .querySelectorAll("[data-close-modal]")
    .forEach(button => {
        button.addEventListener("click", () => closeModal("eventModal"));
    });


document
    .querySelectorAll("[data-close-reauth]")
    .forEach(button => {
        button.addEventListener("click", () => closeModal("reauthModal"));
    });


document
    .getElementById("editProfileClose")
    .addEventListener("click", () => {

        if (hasUnsavedChanges) {
            document.getElementById("unsavedModal").classList.remove("hidden");
            return;
        }

        closeModal("editProfileModal");
    });


document
    .querySelector("[data-close-assistant]")
    .addEventListener("click", () => closeModal("assistantModal"));


/* =========================================================
   CLICAR FORA DO MODAL / TECLA ESC
========================================================= */

document
    .querySelectorAll(".modal-overlay")
    .forEach(overlay => {

        overlay.addEventListener("click", event => {

            if (event.target !== overlay) {
                return;
            }

            if (
                (overlay.id === "profileModal" || overlay.id === "editProfileModal") &&
                hasUnsavedChanges
            ) {
                document.getElementById("unsavedModal").classList.remove("hidden");
                return;
            }

            if (overlay.id === "confirmModal") {
                confirmCallback = null;
            }

            overlay.classList.add("hidden");
        });
    });


document.addEventListener("keydown", event => {

    if (event.key !== "Escape") {
        return;
    }

    // Fecha o modal que está por cima
    const order = ["confirmModal", "eventModal", "reauthModal", "assistantModal"];

    const open = order.find(id => !document.getElementById(id).classList.contains("hidden"));

    if (open) {

        if (open === "confirmModal") {
            confirmCallback = null;
        }

        closeModal(open);
    }
});


/* =========================================================
   NAVEGAÇÃO
========================================================= */

document
    .querySelectorAll(".nav-link")
    .forEach(link => {

        link.addEventListener("click", event => {

            event.preventDefault();

            document
                .getElementById(link.dataset.section)
                ?.scrollIntoView({ behavior: "smooth" });

            document
                .querySelectorAll(".nav-link")
                .forEach(item => item.classList.remove("active"));

            link.classList.add("active");

            document.querySelector(".main-nav").classList.remove("open");
        });
    });


/* =========================================================
   BOTÃO EXPLORAR
========================================================= */

document
    .querySelector("[data-scroll-events]")
    .addEventListener("click", () => {
        document.getElementById("events").scrollIntoView({ behavior: "smooth" });
    });


/* =========================================================
   MINHAS INSCRIÇÕES
========================================================= */

document
    .querySelector("[data-section-link='registrations']")
    .addEventListener("click", () => {
        document.getElementById("registrations").scrollIntoView({ behavior: "smooth" });
    });


/* =========================================================
   MOBILE MENU
========================================================= */

document
    .getElementById("mobileMenuButton")
    .addEventListener("click", () => {
        document.querySelector(".main-nav").classList.toggle("open");
    });


/* =========================================================
   PASSWORD TOGGLE
========================================================= */

document
    .querySelectorAll("[data-toggle-password]")
    .forEach(button => {

        button.addEventListener("click", () => {

            const input = document.getElementById(button.dataset.togglePassword);

            input.type = input.type === "password" ? "text" : "password";
        });
    });


/* =========================================================
   BOTÕES DE LOGIN / CADASTRO
========================================================= */

document
    .getElementById("goLogin")
    .addEventListener("click", () => {
        clearForms();
        showAuthView("loginView");
    });


document
    .getElementById("goRegister")
    .addEventListener("click", () => {
        clearForms();
        showAuthView("registerView");
    });


document
    .querySelectorAll("[data-back-auth]")
    .forEach(button => {

        button.addEventListener("click", () => {
            clearForms();
            showAuthView("authChoice");
        });
    });


document
    .getElementById("backFromConfirm")
    .addEventListener("click", () => {

        stopCodeTimer("confirm");

        clearForms();

        document.getElementById("loginEmail").value = pendingConfirmEmail || "";

        showAuthView("loginView");
    });


/* =========================================================
   ESQUECI SENHA
========================================================= */

document
    .getElementById("goForgot")
    .addEventListener("click", () => {
        clearForms();
        showAuthView("forgotEmailView");
    });


document
    .querySelector("[data-back-login]")
    .addEventListener("click", () => {
        clearForms();
        showAuthView("loginView");
    });


document
    .getElementById("backForgotEmail")
    .addEventListener("click", () => {
        stopCodeTimer("forgot");
        clearForms();
        showAuthView("forgotEmailView");
    });


/* =========================================================
   LOGOUT
========================================================= */

document
    .getElementById("logoutButton")
    .addEventListener("click", logout);


/* =========================================================
   RESTAURAR SESSÃO
   (o cookie de sessão é enviado automaticamente)
========================================================= */

async function restoreSession() {

    try {

        const data = await api("/auth/me");

        if (!data.aluno) {
            showAuthView("authChoice");
            return;
        }

        await openMainScreen(data.aluno);
    }
    catch (error) {

        showAuthView("authChoice");

        if (error.status === 0) {
            showToast(error.message, "error");
        }
    }
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

restoreSession();
