const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutButton = document.getElementById("logout");
const headerStatus = document.getElementById("header-status");
const connectCanva = document.getElementById("connect-canva");
const canvaTitle = document.getElementById("canva-title");
const canvaCopy = document.getElementById("canva-copy");
const briefForm = document.getElementById("brief-form");
const rawBrief = document.getElementById("rawBrief");
const interpretBrief = document.getElementById("interpret-brief");
const formNotice = document.getElementById("form-notice");
const briefReview = document.getElementById("brief-review");
const reviewSummary = document.getElementById("review-summary");
const briefList = document.getElementById("brief-list");
const createSelected = document.getElementById("create-selected");
const jobMessage = document.getElementById("job-message");
const jobError = document.getElementById("job-error");
const result = document.getElementById("result");
const resultsList = document.getElementById("results-list");
const steps = [...document.querySelectorAll(".step")];

let currentStatus = null;
let parsedItems = [];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação");
  return data;
}

function statusPill(label, ok, warningLabel) {
  const state = ok ? "ok" : "warn";
  return `<span class="pill ${state}"><span class="dot"></span>${ok ? label : warningLabel}</span>`;
}

function updateCreateButton() {
  const selected = briefList.querySelectorAll('input[type="checkbox"]:checked').length;
  createSelected.disabled = !currentStatus?.connected || !selected;
  createSelected.textContent = selected ? `Criar ${selected} ${selected === 1 ? "arte" : "artes"} no Canva` : "Selecione ao menos uma arte";
}

function renderStatus(status) {
  currentStatus = status;
  headerStatus.innerHTML = [
    statusPill("Canva conectado", status.connected, "Canva desconectado"),
    statusPill("IA ativa", status.aiConfigured, "Modo de teste"),
  ].join("");

  if (status.connected) {
    canvaTitle.textContent = "Canva conectado";
    canvaCopy.textContent = "Os briefings aprovados serão criados na conta autorizada.";
    connectCanva.textContent = "Reconectar conta";
    connectCanva.className = "button ghost";
  } else {
    canvaTitle.textContent = "Conecte o Canva";
    canvaCopy.textContent = "Você já pode interpretar o briefing. Para criar as artes, uma pessoa precisa autorizar a conta.";
    connectCanva.textContent = "Conectar Canva";
    connectCanva.className = "button accent";
  }

  updateCreateButton();
  if (!status.connected) {
    formNotice.textContent = "O Canva está desconectado. Você pode conferir a interpretação do briefing, mas precisará conectar a conta antes de criar as artes.";
    formNotice.hidden = false;
  } else if (!status.aiConfigured) {
    formNotice.textContent = "Modo de teste ativo: o briefing e os carrosséis funcionam, mas posts que vierem apenas com título ainda usam textos e fotografias de teste.";
    formNotice.hidden = false;
  } else {
    formNotice.hidden = true;
  }
}

function showAuthenticated(status) {
  loginView.hidden = true;
  appView.hidden = false;
  logoutButton.hidden = !status.authRequired;
  renderStatus(status);
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
  logoutButton.hidden = true;
  document.getElementById("password").focus();
}

async function refreshStatus() {
  const status = await api("/api/status");
  if (status.authRequired && !status.authenticated) showLogin();
  else showAuthenticated(status);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ password: loginForm.password.value }) });
    loginForm.reset();
    await refreshStatus();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  await refreshStatus();
});

function renderBriefItems(items) {
  parsedItems = items;
  briefList.replaceChildren();
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "brief-item";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;
    check.dataset.itemId = item.id;
    check.setAttribute("aria-label", `Selecionar ${item.title}`);
    check.addEventListener("change", updateCreateButton);

    const date = document.createElement("div");
    date.className = "brief-date";
    date.textContent = item.date;

    const copy = document.createElement("div");
    const title = document.createElement("div");
    title.className = "brief-title";
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "brief-meta";
    meta.textContent = item.kind === "carousel"
      ? `Carrossel · ${item.slideCount} telas · ${item.format}`
      : `Post único · ${item.format}`;
    copy.append(title, meta);
    for (const message of item.warnings || []) {
      const warning = document.createElement("div");
      warning.className = "brief-warning";
      warning.textContent = `Confira: ${message}`;
      copy.appendChild(warning);
    }
    row.append(check, date, copy);
    briefList.appendChild(row);
  }

  const carousels = items.filter((item) => item.kind === "carousel").length;
  const warnings = items.reduce((total, item) => total + (item.warnings?.length || 0), 0);
  reviewSummary.textContent = `${items.length} ${items.length === 1 ? "post encontrado" : "posts encontrados"}${carousels ? `, sendo ${carousels} ${carousels === 1 ? "carrossel" : "carrosséis"}` : ""}${warnings ? ` · ${warnings} ponto para conferir` : ""}.`;
  briefReview.hidden = false;
  updateCreateButton();
}

briefForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  interpretBrief.disabled = true;
  briefReview.hidden = true;
  jobError.hidden = true;
  result.hidden = true;
  jobMessage.textContent = "Lendo datas, títulos e telas…";
  try {
    const data = await api("/api/briefings/parse", {
      method: "POST",
      body: JSON.stringify({ text: rawBrief.value }),
    });
    renderBriefItems(data.items);
    jobMessage.textContent = "Briefing interpretado. Confira os posts encontrados antes de criar.";
  } catch (error) {
    jobError.textContent = error.message;
    jobError.hidden = false;
    jobMessage.textContent = "Não consegui interpretar este briefing.";
  } finally {
    interpretBrief.disabled = false;
  }
});

const stepOrder = ["planning", "image", "design", "canva", "done"];

function renderProgress(job, prefix = "") {
  jobMessage.textContent = `${prefix}${job.message}`;
  const currentIndex = stepOrder.indexOf(job.status);
  steps.forEach((step) => {
    const index = stepOrder.indexOf(step.dataset.step);
    step.classList.toggle("done", job.status === "done" || (currentIndex > index && currentIndex >= 0));
    step.classList.toggle("active", index === currentIndex);
    step.querySelector(".step-number").textContent = step.classList.contains("done") ? "✓" : String(index + 1);
  });
}

async function pollJob(id, prefix) {
  const deadline = Date.now() + 7 * 60_000;
  while (Date.now() < deadline) {
    const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    renderProgress(job, prefix);
    if (job.status === "done") return job;
    if (job.status === "failed") throw new Error(job.error || "Não foi possível criar o post");
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  throw new Error("A criação está demorando mais que o esperado. Verifique novamente em instantes.");
}

function addResult(item, job, error = null) {
  const card = document.createElement("div");
  card.className = `result-item${error ? " error" : ""}`;
  const title = document.createElement("strong");
  title.textContent = `${item.date} — ${item.title}`;
  const detail = document.createElement("p");
  detail.textContent = error ? error.message : `${item.slideCount} ${item.slideCount === 1 ? "página editável" : "páginas editáveis"} criadas.`;
  card.append(title, detail);

  if (!error) {
    const actions = document.createElement("div");
    actions.className = "result-actions";
    const edit = document.createElement("a");
    edit.className = "button primary";
    edit.href = job.result.editUrl;
    edit.target = "_blank";
    edit.rel = "noopener noreferrer";
    edit.textContent = "Editar no Canva";
    const copy = document.createElement("button");
    copy.className = "button ghost";
    copy.type = "button";
    copy.textContent = "Copiar legenda";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(job.result.caption || "");
        copy.textContent = "Legenda copiada";
        setTimeout(() => { copy.textContent = "Copiar legenda"; }, 1800);
      } catch {
        copy.textContent = "Não foi possível copiar";
      }
    });
    actions.append(edit, copy);
    card.appendChild(actions);
  }
  resultsList.appendChild(card);
}

createSelected.addEventListener("click", async () => {
  if (!currentStatus?.connected) return;
  const selectedIds = new Set([...briefList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.dataset.itemId));
  const selected = parsedItems.filter((item) => selectedIds.has(item.id));
  if (!selected.length) return;

  createSelected.disabled = true;
  interpretBrief.disabled = true;
  jobError.hidden = true;
  resultsList.replaceChildren();
  result.hidden = false;
  let completed = 0;

  for (const [index, item] of selected.entries()) {
    const prefix = `Arte ${index + 1} de ${selected.length}: `;
    try {
      const queued = await api("/api/jobs", { method: "POST", body: JSON.stringify(item.brief) });
      renderProgress(queued, prefix);
      const job = await pollJob(queued.id, prefix);
      addResult(item, job);
      completed += 1;
    } catch (error) {
      addResult(item, null, error);
      if (/Canva|conta conectada/i.test(error.message)) {
        await refreshStatus().catch(() => {});
        break;
      }
    }
  }

  jobMessage.textContent = `${completed} de ${selected.length} ${completed === 1 ? "arte criada" : "artes criadas"}.`;
  interpretBrief.disabled = false;
  updateCreateButton();
});

const query = new URLSearchParams(location.search);
if (query.has("connected") || query.has("error")) history.replaceState({}, "", "/");

refreshStatus().catch((error) => {
  loginView.hidden = true;
  appView.hidden = false;
  formNotice.textContent = `Não foi possível iniciar o agente: ${error.message}`;
  formNotice.className = "notice error";
  formNotice.hidden = false;
});
