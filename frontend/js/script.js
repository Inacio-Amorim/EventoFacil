/* =========================================================
   EVENTOFÁCIL 2.0
   Frontend prototype

   IMPORTANTE:
   Este arquivo utiliza localStorage apenas para protótipo.

   Na versão final:
   Frontend
       ↓
   Flask
       ↓
   MySQL

   Senhas devem ser armazenadas no backend
   utilizando hash seguro.
========================================================= */


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const STORAGE_USERS = "eventoFacil_users";
const STORAGE_SESSION = "eventoFacil_session";
const STORAGE_REGISTRATIONS = "eventoFacil_registrations";


/* =========================================================
   EVENTOS
========================================================= */

const events = [

    {
        id: 1,

        title: "IA Generativa na Prática",

        category: "Tecnologia",

        date: "30 SET",

        fullDate: "30 de setembro de 2026",

        time: "19:00",

        location: "Auditório 01",

        capacity: 42,

        totalCapacity: 100,

        description:
            "Uma introdução prática às possibilidades da inteligência artificial generativa no ambiente acadêmico e profissional.",

        image:
            "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=85"
    },


    {
        id: 2,

        title: "Carreira & Primeiro Emprego",

        category: "Carreira",

        date: "03 OUT",

        fullDate: "03 de outubro de 2026",

        time: "18:30",

        location: "Sala Magna",

        capacity: 17,

        totalCapacity: 80,

        description:
            "Estratégias para entrar no mercado, construir currículo e desenvolver uma carreira profissional.",

        image:
            "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=85"
    },


    {
        id: 3,

        title: "Semana de Desenvolvimento Web",

        category: "Tecnologia",

        date: "07 OUT",

        fullDate: "07 de outubro de 2026",

        time: "19:00",

        location: "Laboratório 04",

        capacity: 0,

        totalCapacity: 60,

        description:
            "Uma experiência dedicada ao desenvolvimento web moderno, interfaces e novas tecnologias.",

        image:
            "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=85"
    },


    {
        id: 4,

        title: "Comunicação e Apresentações",

        category: "Acadêmico",

        date: "10 OUT",

        fullDate: "10 de outubro de 2026",

        time: "20:00",

        location: "Auditório 02",

        capacity: 31,

        totalCapacity: 100,

        description:
            "Aprenda técnicas para apresentar ideias com clareza, confiança e impacto.",

        image:
            "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=85"
    },


    {
        id: 5,

        title: "Design, Criatividade & Tecnologia",

        category: "Criatividade",

        date: "15 OUT",

        fullDate: "15 de outubro de 2026",

        time: "19:00",

        location: "Espaço Inovação",

        capacity: 26,

        totalCapacity: 70,

        description:
            "Como criatividade, design e tecnologia podem trabalhar juntos para criar experiências melhores.",

        image:
            "https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1200&q=85"
    },


    {
        id: 6,

        title: "Dados e o Futuro das Profissões",

        category: "Acadêmico",

        date: "21 OUT",

        fullDate: "21 de outubro de 2026",

        time: "18:00",

        location: "Auditório 01",

        capacity: 12,

        totalCapacity: 100,

        description:
            "Uma conversa sobre dados, transformação digital e as novas oportunidades profissionais.",

        image:
            "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=85"
    }

];


/* =========================================================
   ESTADO
========================================================= */

let currentUser = null;

let currentEvent = null;

let currentCategory = "Todos";

let editingField = null;

let hasUnsavedChanges = false;

let recoveryEmail = null;

let recoveryCode = null;

let recoveryCodeExpiration = null;

let recoveryTimer = null;


/* =========================================================
   ELEMENTOS
========================================================= */

const authScreen =
    document.getElementById("authScreen");

const mainScreen =
    document.getElementById("mainScreen");

const authViews =
    document.querySelectorAll(".auth-view");

const eventsGrid =
    document.getElementById("eventsGrid");

const registrationsList =
    document.getElementById("registrationsList");


/* =========================================================
   STORAGE
========================================================= */

function getUsers() {

    return JSON.parse(
        localStorage.getItem(STORAGE_USERS) || "[]"
    );

}


function saveUsers(users) {

    localStorage.setItem(
        STORAGE_USERS,
        JSON.stringify(users)
    );

}


function getRegistrations() {

    return JSON.parse(
        localStorage.getItem(STORAGE_REGISTRATIONS) || "{}"
    );

}


function saveRegistrations(registrations) {

    localStorage.setItem(
        STORAGE_REGISTRATIONS,
        JSON.stringify(registrations)
    );

}


/* =========================================================
   HASH SIMPLES PARA PROTÓTIPO
========================================================= */

async function hashPassword(password) {

    const data =
        new TextEncoder().encode(password);

    const hashBuffer =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    const hashArray =
        Array.from(new Uint8Array(hashBuffer));

    return hashArray
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");

}


/*
    ATENÇÃO:

    Isso é apenas uma proteção básica
    para o protótipo.

    Na versão final o hash deve ser feito
    pelo Flask usando uma biblioteca própria
    de autenticação.
*/


/* =========================================================
   NAVEGAÇÃO ENTRE TELAS
========================================================= */

function showAuthView(viewId) {

    authViews.forEach(view => {

        view.classList.remove("active");

    });

    const target =
        document.getElementById(viewId);

    if (target) {
        target.classList.add("active");
    }

}


function openMainScreen(user) {

    currentUser = user;

    localStorage.setItem(
        STORAGE_SESSION,
        user.email
    );

    authScreen.classList.add("hidden");

    mainScreen.classList.remove("hidden");

    updateProfileUI();

    renderEvents();

    renderRegistrations();

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });

}


/* =========================================================
   LOGOUT
========================================================= */

function logout() {

    localStorage.removeItem(
        STORAGE_SESSION
    );

    currentUser = null;

    mainScreen.classList.add("hidden");

    authScreen.classList.remove("hidden");

    showAuthView("authChoice");

    clearForms();

    showToast(
        "Você saiu da sua conta.",
        "success"
    );

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

function setFieldError(
    inputId,
    errorId,
    message
) {

    const input =
        document.getElementById(inputId);

    const error =
        document.getElementById(errorId);

    if (!input || !error) {
        return;
    }

    const field =
        input.closest(".field");

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

function showToast(
    message,
    type = "success"
) {

    const container =
        document.getElementById(
            "toastContainer"
        );

    const toast =
        document.createElement("div");

    toast.className =
        `toast ${type}`;

    toast.textContent =
        message;

    container.appendChild(toast);

    setTimeout(() => {

        toast.style.opacity = "0";

        toast.style.transform =
            "translateX(30px)";

        setTimeout(() => {

            toast.remove();

        }, 300);

    }, 3500);

}


/* =========================================================
   VALIDAR EMAIL
========================================================= */

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}


/*
    IMPORTANTE:

    Esta função verifica se o endereço
    possui formato válido.

    Ela NÃO consegue garantir que o e-mail
    realmente exista.

    Para isso, o backend deverá enviar
    um e-mail de confirmação ou utilizar
    um serviço próprio.
*/


/* =========================================================
   LOGIN
========================================================= */

document
    .getElementById("loginForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            clearErrors();

            const email =
                document
                    .getElementById("loginEmail")
                    .value
                    .trim()
                    .toLowerCase();

            const password =
                document
                    .getElementById("loginPassword")
                    .value;

            let hasError = false;

            if (!email) {

                setFieldError(
                    "loginEmail",
                    "loginEmailError",
                    "Digite seu e-mail."
                );

                hasError = true;

            }
            else if (!isValidEmail(email)) {

                setFieldError(
                    "loginEmail",
                    "loginEmailError",
                    "Digite um e-mail válido."
                );

                hasError = true;

            }


            if (!password) {

                setFieldError(
                    "loginPassword",
                    "loginPasswordError",
                    "Digite sua senha."
                );

                hasError = true;

            }


            if (hasError) {

                shakeScreen();

                return;

            }


            const users =
                getUsers();

            const user =
                users.find(
                    item =>
                        item.email === email
                );


            if (!user) {

                setFieldError(
                    "loginEmail",
                    "loginEmailError",
                    "E-mail não encontrado."
                );

                shakeScreen();

                return;

            }


            const passwordHash =
                await hashPassword(password);


            if (
                passwordHash !==
                user.passwordHash
            ) {

                setFieldError(
                    "loginPassword",
                    "loginPasswordError",
                    "Senha incorreta."
                );

                shakeScreen();

                return;

            }


            openMainScreen(user);

            showToast(
                `Bem-vindo, ${user.name.split(" ")[0]}!`,
                "success"
            );

        }
    );


/* =========================================================
   CADASTRO
========================================================= */

document
    .getElementById("registerForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            clearErrors();

            const name =
                document
                    .getElementById("registerName")
                    .value
                    .trim();

            const email =
                document
                    .getElementById("registerEmail")
                    .value
                    .trim()
                    .toLowerCase();

            const password =
                document
                    .getElementById("registerPassword")
                    .value;

            const confirmPassword =
                document
                    .getElementById(
                        "registerPasswordConfirm"
                    )
                    .value;


            let hasError = false;


            if (!name) {

                setFieldError(
                    "registerName",
                    "registerNameError",
                    "Digite seu nome completo."
                );

                hasError = true;

            }
            else if (
                name.split(" ").filter(Boolean).length < 2
            ) {

                setFieldError(
                    "registerName",
                    "registerNameError",
                    "Digite nome e sobrenome."
                );

                hasError = true;

            }


            if (!email) {

                setFieldError(
                    "registerEmail",
                    "registerEmailError",
                    "Digite seu e-mail."
                );

                hasError = true;

            }
            else if (!isValidEmail(email)) {

                setFieldError(
                    "registerEmail",
                    "registerEmailError",
                    "E-mail inválido."
                );

                hasError = true;

            }


            if (!password) {

                setFieldError(
                    "registerPassword",
                    "registerPasswordError",
                    "Digite uma senha."
                );

                hasError = true;

            }
            else if (password.length < 6) {

                setFieldError(
                    "registerPassword",
                    "registerPasswordError",
                    "A senha deve ter pelo menos 6 caracteres."
                );

                hasError = true;

            }


            if (!confirmPassword) {

                setFieldError(
                    "registerPasswordConfirm",
                    "registerPasswordConfirmError",
                    "Confirme sua senha."
                );

                hasError = true;

            }
            else if (
                password !== confirmPassword
            ) {

                setFieldError(
                    "registerPasswordConfirm",
                    "registerPasswordConfirmError",
                    "As senhas não são iguais."
                );

                hasError = true;

            }


            if (hasError) {

                shakeScreen();

                return;

            }


            const users =
                getUsers();


            const alreadyExists =
                users.some(
                    user =>
                        user.email === email
                );


            if (alreadyExists) {

                setFieldError(
                    "registerEmail",
                    "registerEmailError",
                    "Este e-mail já possui uma conta."
                );

                shakeScreen();

                return;

            }


            const passwordHash =
                await hashPassword(password);


            const newUser = {

                id:
                    Date.now(),

                name,

                email,

                passwordHash,

                createdAt:
                    new Date().toISOString()

            };


            users.push(newUser);

            saveUsers(users);


            openMainScreen(newUser);


            showToast(
                "Conta criada com sucesso!",
                "success"
            );

        }
    );


/* =========================================================
   RECUPERAÇÃO - EMAIL
========================================================= */

document
    .getElementById("forgotEmailForm")
    .addEventListener(
        "submit",
        event => {

            event.preventDefault();

            clearErrors();

            const email =
                document
                    .getElementById("forgotEmail")
                    .value
                    .trim()
                    .toLowerCase();


            if (!email) {

                setFieldError(
                    "forgotEmail",
                    "forgotEmailError",
                    "Digite seu e-mail."
                );

                shakeScreen();

                return;

            }


            if (!isValidEmail(email)) {

                setFieldError(
                    "forgotEmail",
                    "forgotEmailError",
                    "Digite um e-mail válido."
                );

                shakeScreen();

                return;

            }


            const users =
                getUsers();

            const user =
                users.find(
                    item =>
                        item.email === email
                );


            if (!user) {

                setFieldError(
                    "forgotEmail",
                    "forgotEmailError",
                    "E-mail não encontrado."
                );

                shakeScreen();

                return;

            }


            recoveryEmail = email;

            recoveryCode =
                Math.floor(
                    100000 +
                    Math.random() * 900000
                ).toString();

            recoveryCodeExpiration =
                Date.now() +
                5 * 60 * 1000;


            /*
                PROTÓTIPO:

                Aqui o código apenas é criado
                localmente.

                VERSÃO REAL:

                enviar:

                POST /auth/forgot-password

                O Flask deverá gerar o código,
                salvar temporariamente e enviar
                pelo serviço de e-mail.
            */


            console.log(
                "Código de recuperação (protótipo):",
                recoveryCode
            );


            startRecoveryTimer();

            showAuthView(
                "forgotCodeView"
            );


            showToast(
                "Código de recuperação enviado.",
                "success"
            );

        }
    );


/* =========================================================
   TIMER RECUPERAÇÃO
========================================================= */

function startRecoveryTimer() {

    clearInterval(recoveryTimer);

    function updateTimer() {

        const remaining =
            Math.max(
                0,
                recoveryCodeExpiration -
                Date.now()
            );

        const seconds =
            Math.floor(
                remaining / 1000
            );

        const minutes =
            Math.floor(
                seconds / 60
            );

        const rest =
            seconds % 60;

        document.getElementById(
            "codeTimer"
        ).textContent =
            `Código válido por ${String(minutes).padStart(2,"0")}:${String(rest).padStart(2,"0")}`;


        if (remaining <= 0) {

            clearInterval(
                recoveryTimer
            );

            document.getElementById(
                "codeTimer"
            ).textContent =
                "Código expirado.";

        }

    }


    updateTimer();

    recoveryTimer =
        setInterval(
            updateTimer,
            1000
        );

}


/* =========================================================
   CÓDIGO DE 6 DÍGITOS
========================================================= */

const codeInputs =
    document.querySelectorAll(
        ".code-inputs input"
    );


codeInputs.forEach(
    (input, index) => {

        input.addEventListener(
            "input",
            () => {

                input.value =
                    input.value.replace(
                        /\D/g,
                        ""
                    );


                if (
                    input.value &&
                    index <
                    codeInputs.length - 1
                ) {

                    codeInputs[
                        index + 1
                    ].focus();

                }

            }
        );


        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Backspace" &&
                    !input.value &&
                    index > 0
                ) {

                    codeInputs[
                        index - 1
                    ].focus();

                }

            }
        );

    }
);


/* =========================================================
   CONFIRMAR CÓDIGO
========================================================= */

document
    .getElementById("forgotCodeForm")
    .addEventListener(
        "submit",
        event => {

            event.preventDefault();

            const enteredCode =
                Array
                    .from(codeInputs)
                    .map(
                        input =>
                            input.value
                    )
                    .join("");


            if (
                Date.now() >
                recoveryCodeExpiration
            ) {

                document.getElementById(
                    "forgotCodeError"
                ).textContent =
                    "Este código expirou.";

                shakeScreen();

                return;

            }


            if (
                enteredCode !==
                recoveryCode
            ) {

                document.getElementById(
                    "forgotCodeError"
                ).textContent =
                    "Código incorreto.";

                shakeScreen();

                return;

            }


            clearInterval(
                recoveryTimer
            );


            showAuthView(
                "resetPasswordView"
            );

        }
    );


/* =========================================================
   NOVA SENHA
========================================================= */

document
    .getElementById("resetPasswordForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            clearErrors();

            const password =
                document
                    .getElementById("newPassword")
                    .value;

            const confirm =
                document
                    .getElementById(
                        "newPasswordConfirm"
                    )
                    .value;


            let hasError = false;


            if (!password) {

                setFieldError(
                    "newPassword",
                    "newPasswordError",
                    "Digite a nova senha."
                );

                hasError = true;

            }
            else if (password.length < 6) {

                setFieldError(
                    "newPassword",
                    "newPasswordError",
                    "A senha deve ter pelo menos 6 caracteres."
                );

                hasError = true;

            }


            if (!confirm) {

                setFieldError(
                    "newPasswordConfirm",
                    "newPasswordConfirmError",
                    "Confirme a nova senha."
                );

                hasError = true;

            }
            else if (
                password !== confirm
            ) {

                setFieldError(
                    "newPasswordConfirm",
                    "newPasswordConfirmError",
                    "As senhas não são iguais."
                );

                hasError = true;

            }


            if (hasError) {

                shakeScreen();

                return;

            }


            const users =
                getUsers();

            const userIndex =
                users.findIndex(
                    user =>
                        user.email ===
                        recoveryEmail
                );


            if (userIndex === -1) {

                showToast(
                    "Conta não encontrada.",
                    "error"
                );

                return;

            }


            users[userIndex].passwordHash =
                await hashPassword(password);


            saveUsers(users);


            clearInterval(
                recoveryTimer
            );


            recoveryEmail = null;

            recoveryCode = null;


            clearForms();

            showAuthView(
                "loginView"
            );


            showToast(
                "Senha alterada. Faça login novamente.",
                "success"
            );

        }
    );


/* =========================================================
   EVENTOS
========================================================= */

function renderEvents() {

    const search =
        document
            .getElementById("eventSearch")
            .value
            .trim()
            .toLowerCase();


    const filtered =
        events.filter(event => {

            const matchesCategory =
                currentCategory === "Todos" ||
                event.category === currentCategory;


            const matchesSearch =
                event.title
                    .toLowerCase()
                    .includes(search) ||
                event.description
                    .toLowerCase()
                    .includes(search) ||
                event.category
                    .toLowerCase()
                    .includes(search);


            return (
                matchesCategory &&
                matchesSearch
            );

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


    filtered.forEach(
        (event, index) => {

            const available =
                event.capacity <
                event.totalCapacity;


            const card =
                document.createElement("article");

            card.className =
                "event-card";

            card.style.animationDelay =
                `${index * 70}ms`;


            card.innerHTML = `

                <div class="event-card-image">

                    <img
                        src="${event.image}"
                        alt="${event.title}"
                    >

                    <div
                        class="event-card-gradient"
                    ></div>

                </div>


                <div class="event-card-content">

                    <span class="event-category">
                        ${event.category}
                    </span>

                    <h3>
                        ${event.title}
                    </h3>

                    <p class="event-card-description">
                        ${event.description}
                    </p>

                    <div class="event-meta">

                        <span>
                            ◷ ${event.date}
                        </span>

                        <span>
                            ◉ ${event.time}
                        </span>

                        <span>
                            ⌖ ${event.location}
                        </span>

                    </div>

                    <div
                        class="
                            event-capacity
                            ${!available ? "full" : ""}
                        "
                    >
                        ${
                            available
                            ? `${event.capacity} vagas ocupadas`
                            : "Evento lotado"
                        }
                    </div>

                </div>

            `;


            card.addEventListener(
                "click",
                () => openEventModal(event)
            );


            eventsGrid.appendChild(card);

        }
    );

}


/* =========================================================
   FILTRO CATEGORIA
========================================================= */

document
    .querySelectorAll(".category-filter")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                document
                    .querySelectorAll(
                        ".category-filter"
                    )
                    .forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );


                button.classList.add(
                    "active"
                );


                currentCategory =
                    button.dataset.category;


                renderEvents();

            }
        );

    });


/* =========================================================
   BUSCA
========================================================= */

document
    .getElementById("eventSearch")
    .addEventListener(
        "input",
        renderEvents
    );


/* =========================================================
   MODAL EVENTO
========================================================= */

function openEventModal(event) {

    currentEvent = event;


    document.getElementById(
        "modalEventTitle"
    ).textContent =
        event.title;


    document.getElementById(
        "modalEventCategory"
    ).textContent =
        event.category;


    document.getElementById(
        "modalEventDescription"
    ).textContent =
        event.description;


    document.getElementById(
        "modalEventImage"
    ).style.backgroundImage =
        `url("${event.image}")`;


    document.getElementById(
        "modalEventInfo"
    ).innerHTML = `

        <div class="modal-info-item">

            <span>Data</span>

            <strong>
                ${event.fullDate}
            </strong>

        </div>


        <div class="modal-info-item">

            <span>Horário</span>

            <strong>
                ${event.time}
            </strong>

        </div>


        <div class="modal-info-item">

            <span>Local</span>

            <strong>
                ${event.location}
            </strong>

        </div>


        <div class="modal-info-item">

            <span>Vagas</span>

            <strong>
                ${event.totalCapacity - event.capacity}
                disponíveis
            </strong>

        </div>

    `;


    const registrations =
        getRegistrations();

    const userRegistrations =
        registrations[
            currentUser.email
        ] || [];


    const alreadyRegistered =
        userRegistrations.includes(
            event.id
        );


    const button =
        document.getElementById(
            "modalRegisterButton"
        );


    if (alreadyRegistered) {

        button.innerHTML =
            "Você já está inscrito ✓";

        button.disabled = true;

        button.style.opacity = ".6";

    }
    else if (
        event.capacity >=
        event.totalCapacity
    ) {

        button.innerHTML =
            "Evento lotado";

        button.disabled = true;

        button.style.opacity = ".6";

    }
    else {

        button.innerHTML =
            "Inscrever-se <span>→</span>";

        button.disabled = false;

        button.style.opacity = "1";

    }


    document
        .getElementById("eventModal")
        .classList.remove("hidden");

}


/* =========================================================
   INSCRIÇÃO
========================================================= */

document
    .getElementById("modalRegisterButton")
    .addEventListener(
        "click",
        () => {

            if (
                !currentUser ||
                !currentEvent
            ) {
                return;
            }


            const registrations =
                getRegistrations();


            if (
                !registrations[
                    currentUser.email
                ]
            ) {

                registrations[
                    currentUser.email
                ] = [];

            }


            if (
                registrations[
                    currentUser.email
                ].includes(
                    currentEvent.id
                )
            ) {

                return;

            }


            registrations[
                currentUser.email
            ].push(
                currentEvent.id
            );


            saveRegistrations(
                registrations
            );


            currentEvent.capacity++;


            closeModal(
                "eventModal"
            );


            renderRegistrations();

            renderEvents();


            showToast(
                "Inscrição realizada com sucesso!",
                "success"
            );

        }
    );


/* =========================================================
   MINHAS INSCRIÇÕES
========================================================= */

function renderRegistrations() {

    if (!currentUser) {
        return;
    }


    const registrations =
        getRegistrations();


    const userRegistrations =
        registrations[
            currentUser.email
        ] || [];


    registrationsList.innerHTML = "";


    if (!userRegistrations.length) {

        registrationsList.innerHTML = `

            <div class="empty-state">

                <strong>
                    Você ainda não possui inscrições.
                </strong>

                Explore os próximos eventos
                e escolha sua próxima experiência.

            </div>

        `;

        return;

    }


    userRegistrations.forEach(
        eventId => {

            const event =
                events.find(
                    item =>
                        item.id === eventId
                );


            if (!event) {
                return;
            }


            const item =
                document.createElement("div");

            item.className =
                "registration-item";


            item.innerHTML = `

                <div class="registration-info">

                    <h3>
                        ${event.title}
                    </h3>

                    <p>
                        ${event.date}
                        ·
                        ${event.time}
                        ·
                        ${event.location}
                    </p>

                </div>

                <span
                    class="registration-status"
                >
                    INSCRITO
                </span>

            `;


            registrationsList.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   PERFIL
========================================================= */

function getInitials(name) {

    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(
            word =>
                word[0].toUpperCase()
        )
        .join("");

}


function updateProfileUI() {

    if (!currentUser) {
        return;
    }


    const initials =
        getInitials(
            currentUser.name
        );


    document.getElementById(
        "profileInitials"
    ).textContent =
        initials;


    document.getElementById(
        "profileLargeInitials"
    ).textContent =
        initials;


    document.getElementById(
        "profileName"
    ).textContent =
        currentUser.name;


    document.getElementById(
        "profileEmail"
    ).textContent =
        currentUser.email;

}


/* =========================================================
   ABRIR PERFIL
========================================================= */

document
    .getElementById("profileButton")
    .addEventListener(
        "click",
        () => {

            updateProfileUI();

            document
                .getElementById(
                    "profileModal"
                )
                .classList.remove(
                    "hidden"
                );

        }
    );


/* =========================================================
   ALTERAR PERFIL
========================================================= */

document
    .querySelectorAll(
        "[data-edit-profile]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                editingField =
                    button.dataset.editProfile;

                document
                    .getElementById(
                        "reauthEmail"
                    )
                    .value =
                    currentUser.email;


                document
                    .getElementById(
                        "reauthModal"
                    )
                    .classList.remove(
                        "hidden"
                    );

            }
        );

    });


/* =========================================================
   REAUTENTICAÇÃO
========================================================= */

document
    .getElementById("reauthForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const password =
                document
                    .getElementById(
                        "reauthPassword"
                    )
                    .value;


            const hash =
                await hashPassword(
                    password
                );


            if (
                hash !==
                currentUser.passwordHash
            ) {

                document.getElementById(
                    "reauthError"
                ).textContent =
                    "Senha incorreta.";

                shakeScreen();

                return;

            }


            closeModal(
                "reauthModal"
            );


            openEditProfile();

        }
    );


/* =========================================================
   ABRIR EDITOR
========================================================= */

function openEditProfile() {

    const modal =
        document.getElementById(
            "editProfileModal"
        );


    const title =
        document.getElementById(
            "editProfileTitle"
        );


    const label =
        document.getElementById(
            "newProfileValueLabel"
        );


    const input =
        document.getElementById(
            "newProfileValue"
        );


    const passwordConfirm =
        document.getElementById(
            "confirmNewPasswordField"
        );


    input.value = "";

    passwordConfirm.classList.add(
        "hidden"
    );


    if (editingField === "name") {

        title.textContent =
            "Alterar nome";

        label.textContent =
            "Novo nome completo";

        input.type =
            "text";

        input.placeholder =
            "Digite seu novo nome";

    }


    if (editingField === "email") {

        title.textContent =
            "Alterar e-mail";

        label.textContent =
            "Novo e-mail";

        input.type =
            "email";

        input.placeholder =
            "Digite seu novo e-mail";

    }


    if (editingField === "password") {

        title.textContent =
            "Alterar senha";

        label.textContent =
            "Nova senha";

        input.type =
            "password";

        input.placeholder =
            "Digite sua nova senha";

        passwordConfirm.classList.remove(
            "hidden"
        );

    }


    clearErrors();


    modal.classList.remove(
        "hidden"
    );


    hasUnsavedChanges = true;

}


/* =========================================================
   SALVAR ALTERAÇÃO INDIVIDUAL
========================================================= */

document
    .getElementById("editProfileForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            clearErrors();


            const value =
                document
                    .getElementById(
                        "newProfileValue"
                    )
                    .value
                    .trim();


            if (!value) {

                setFieldError(
                    "newProfileValue",
                    "newProfileValueError",
                    "Preencha este campo."
                );

                shakeScreen();

                return;

            }


            if (
                editingField === "email" &&
                !isValidEmail(value)
            ) {

                setFieldError(
                    "newProfileValue",
                    "newProfileValueError",
                    "Digite um e-mail válido."
                );

                shakeScreen();

                return;

            }


            if (
                editingField === "name" &&
                value
                    .split(" ")
                    .filter(Boolean)
                    .length < 2
            ) {

                setFieldError(
                    "newProfileValue",
                    "newProfileValueError",
                    "Digite nome e sobrenome."
                );

                shakeScreen();

                return;

            }


            if (
                editingField === "password"
            ) {

                if (
                    value.length < 6
                ) {

                    setFieldError(
                        "newProfileValue",
                        "newProfileValueError",
                        "A senha deve ter pelo menos 6 caracteres."
                    );

                    shakeScreen();

                    return;

                }


                const confirm =
                    document
                        .getElementById(
                            "confirmNewPassword"
                        )
                        .value;


                if (
                    value !== confirm
                ) {

                    setFieldError(
                        "confirmNewPassword",
                        "confirmNewPasswordError",
                        "As senhas não são iguais."
                    );

                    shakeScreen();

                    return;

                }

            }


            const users =
                getUsers();


            const index =
                users.findIndex(
                    user =>
                        user.email ===
                        currentUser.email
                );


            if (index === -1) {

                return;

            }


            if (
                editingField === "name"
            ) {

                users[index].name =
                    value;

            }


            if (
                editingField === "email"
            ) {

                const duplicate =
                    users.some(
                        (user, i) =>
                            i !== index &&
                            user.email === value
                    );


                if (duplicate) {

                    setFieldError(
                        "newProfileValue",
                        "newProfileValueError",
                        "Este e-mail já está cadastrado."
                    );

                    shakeScreen();

                    return;

                }


                users[index].email =
                    value;

                currentUser.email =
                    value;

            }


            if (
                editingField === "password"
            ) {

                users[index].passwordHash =
                    await hashPassword(
                        value
                    );

            }


            currentUser =
                users[index];


            saveUsers(users);


            localStorage.setItem(
                STORAGE_SESSION,
                currentUser.email
            );


            closeModal(
                "editProfileModal"
            );


            updateProfileUI();


            hasUnsavedChanges = false;


            showToast(
                "Alteração preparada para salvar.",
                "success"
            );

        }
    );


/* =========================================================
   BOTÃO SALVAR ALTERAÇÕES
========================================================= */

document
    .getElementById(
        "saveProfileChanges"
    )
    .addEventListener(
        "click",
        () => {

            /*
                As alterações individuais já são
                aplicadas após a confirmação.

                Este botão funciona como confirmação
                final visual da edição.
            */

            hasUnsavedChanges = false;

            closeModal(
                "profileModal"
            );

            showToast(
                "Alterações salvas com sucesso!",
                "success"
            );

        }
    );


/* =========================================================
   FECHAR PERFIL
========================================================= */

document
    .getElementById(
        "profileCloseButton"
    )
    .addEventListener(
        "click",
        () => {

            if (hasUnsavedChanges) {

                document
                    .getElementById(
                        "unsavedModal"
                    )
                    .classList.remove(
                        "hidden"
                    );

                return;

            }


            closeModal(
                "profileModal"
            );

        }
    );


/* =========================================================
   NÃO SAIR
========================================================= */

document
    .getElementById(
        "stayEditing"
    )
    .addEventListener(
        "click",
        () => {

            closeModal(
                "unsavedModal"
            );

        }
    );


/* =========================================================
   DESCARTAR
========================================================= */

document
    .getElementById(
        "discardChanges"
    )
    .addEventListener(
        "click",
        () => {

            hasUnsavedChanges = false;

            closeModal(
                "unsavedModal"
            );

            closeModal(
                "profileModal"
            );

        }
    );


/* =========================================================
   MODAIS
========================================================= */

function closeModal(id) {

    const modal =
        document.getElementById(id);

    if (modal) {

        modal.classList.add(
            "hidden"
        );

    }

}


document
    .querySelectorAll(
        "[data-close-modal]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                closeModal(
                    "eventModal"
                );

            }
        );

    });


document
    .querySelectorAll(
        "[data-close-reauth]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                closeModal(
                    "reauthModal"
                );

            }
        );

    });


document
    .getElementById(
        "editProfileClose"
    )
    .addEventListener(
        "click",
        () => {

            if (hasUnsavedChanges) {

                document
                    .getElementById(
                        "unsavedModal"
                    )
                    .classList.remove(
                        "hidden"
                    );

                return;

            }

            closeModal(
                "editProfileModal"
            );

        }
    );


document
    .querySelector(
        "[data-close-assistant]"
    )
    .addEventListener(
        "click",
        () => {

            closeModal(
                "assistantModal"
            );

        }
    );


/* =========================================================
   CLICAR FORA DO MODAL
========================================================= */

document
    .querySelectorAll(
        ".modal-overlay"
    )
    .forEach(overlay => {

        overlay.addEventListener(
            "click",
            event => {

                if (
                    event.target !==
                    overlay
                ) {
                    return;
                }


                if (
                    overlay.id ===
                    "profileModal" &&
                    hasUnsavedChanges
                ) {

                    document
                        .getElementById(
                            "unsavedModal"
                        )
                        .classList.remove(
                            "hidden"
                        );

                    return;

                }


                overlay.classList.add(
                    "hidden"
                );

            }
        );

    });


/* =========================================================
   IA
========================================================= */

document
    .getElementById(
        "openAssistant"
    )
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "assistantModal"
                )
                .classList.remove(
                    "hidden"
                );

        }
    );


/* =========================================================
   NAVEGAÇÃO
========================================================= */

document
    .querySelectorAll(
        ".nav-link"
    )
    .forEach(link => {

        link.addEventListener(
            "click",
            event => {

                event.preventDefault();


                const sectionId =
                    link.dataset.section;


                document
                    .getElementById(
                        sectionId
                    )
                    ?.scrollIntoView({
                        behavior: "smooth"
                    });


                document
                    .querySelectorAll(
                        ".nav-link"
                    )
                    .forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );


                link.classList.add(
                    "active"
                );

            }
        );

    });


/* =========================================================
   BOTÃO EXPLORAR
========================================================= */

document
    .querySelector(
        "[data-scroll-events]"
    )
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "events"
                )
                .scrollIntoView({
                    behavior: "smooth"
                });

        }
    );


/* =========================================================
   MINHAS INSCRIÇÕES
========================================================= */

document
    .querySelector(
        "[data-section-link='registrations']"
    )
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "registrations"
                )
                .scrollIntoView({
                    behavior: "smooth"
                });

        }
    );


/* =========================================================
   MOBILE MENU
========================================================= */

document
    .getElementById(
        "mobileMenuButton"
    )
    .addEventListener(
        "click",
        () => {

            document
                .querySelector(
                    ".main-nav"
                )
                .classList.toggle(
                    "open"
                );

        }
    );


/* =========================================================
   PASSWORD TOGGLE
========================================================= */

document
    .querySelectorAll(
        "[data-toggle-password]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const input =
                    document.getElementById(
                        button.dataset.togglePassword
                    );


                if (
                    input.type ===
                    "password"
                ) {

                    input.type =
                        "text";

                    button.textContent =
                        "◉";

                }
                else {

                    input.type =
                        "password";

                    button.textContent =
                        "◉";

                }

            }
        );

    });


/* =========================================================
   BOTÕES DE LOGIN / CADASTRO
========================================================= */

document
    .getElementById("goLogin")
    .addEventListener(
        "click",
        () => {

            clearForms();

            showAuthView(
                "loginView"
            );

        }
    );


document
    .getElementById("goRegister")
    .addEventListener(
        "click",
        () => {

            clearForms();

            showAuthView(
                "registerView"
            );

        }
    );


document
    .querySelectorAll(
        "[data-back-auth]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                clearForms();

                showAuthView(
                    "authChoice"
                );

            }
        );

    });


/* =========================================================
   ESQUECI SENHA
========================================================= */

document
    .getElementById("goForgot")
    .addEventListener(
        "click",
        () => {

            clearForms();

            showAuthView(
                "forgotEmailView"
            );

        }
    );


document
    .querySelector(
        "[data-back-login]"
    )
    .addEventListener(
        "click",
        () => {

            clearForms();

            showAuthView(
                "loginView"
            );

        }
    );


document
    .getElementById(
        "backForgotEmail"
    )
    .addEventListener(
        "click",
        () => {

            clearForms();

            showAuthView(
                "forgotEmailView"
            );

        }
    );


/* =========================================================
   LOGOUT
========================================================= */

document
    .getElementById(
        "logoutButton"
    )
    .addEventListener(
        "click",
        logout
    );


/* =========================================================
   RESTAURAR SESSÃO
========================================================= */

function restoreSession() {

    const email =
        localStorage.getItem(
            STORAGE_SESSION
        );


    if (!email) {

        showAuthView(
            "authChoice"
        );

        return;

    }


    const users =
        getUsers();


    const user =
        users.find(
            item =>
                item.email === email
        );


    if (!user) {

        localStorage.removeItem(
            STORAGE_SESSION
        );

        showAuthView(
            "authChoice"
        );

        return;

    }


    openMainScreen(user);

}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

restoreSession();

renderEvents();