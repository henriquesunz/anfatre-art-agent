const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutButton = document.getElementById("logout");
const headerStatus = document.getElementById("header-status");
const connectCanva = document.getElementById("connect-canva");
const connectGoogle = document.getElementById("connect-google");
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

function anyDestinationConnected() {
  return Boolean(currentStatus?.connected || currentStatus?.googleConnected);
}

function destinationLabel() {
  return currentStatus?.googleConnected ? "Google Slides" : "Canva";
}

function updateCreateButton() {
  const selected = briefList.querySelectorAll('input[type="checkbox"]:checked').length;
  createSelected.disabled = !anyDestinationConnected() || !selected;
  if (!selected) {
    createSelected.textContent = "Selecione ao menos uma arte";
    return;
  }
  // Deixa explícito no botão o que vai sair: no Google as artes vão para o mesmo
  // arquivo; no Canva cada post ainda vira um arquivo próprio.
  const grouping = selected === 1
    ? ""
    : (currentStatus?.googleConnected ? " · no mesmo arquivo" : " · um arquivo cada");
  createSelected.textContent = `Criar ${selected} ${selected === 1 ? "arte" : "artes"} no ${destinationLabel()}${grouping}`;
}

function renderStatus(status) {
  currentStatus = status;
  headerStatus.innerHTML = [
    statusPill("Google Slides conectado", status.googleConnected, "Google desconectado"),
    statusPill("Canva conectado", status.connected, "Canva desconectado"),
    statusPill("IA ativa", status.aiConfigured, "Modo de teste"),
  ].join("");

  if (connectGoogle) connectGoogle.hidden = !status.googleConfigured;
  if (status.googleConnected) {
    canvaTitle.textContent = "Google Slides conectado";
    canvaCopy.textContent = "As artes serão criadas como apresentações editáveis no Google Slides da conta autorizada.";
    if (connectGoogle) {
      connectGoogle.textContent = "Reconectar Google";
      connectGoogle.className = "button ghost";
    }
  } else if (status.connected) {
    canvaTitle.textContent = "Canva conectado";
    canvaCopy.textContent = "Os briefings aprovados serão criados na conta autorizada. Conecte o Google Slides para usar o novo fluxo com fontes fiéis.";
    connectCanva.textContent = "Reconectar Canva";
    connectCanva.className = "button ghost";
  } else {
    canvaTitle.textContent = "Conecte uma conta";
    canvaCopy.textContent = "Você já pode interpretar o briefing. Para criar as artes, conecte o Google Slides (recomendado) ou o Canva.";
    connectCanva.textContent = "Conectar Canva";
    connectCanva.className = "button ghost";
  }

  updateCreateButton();
  if (!anyDestinationConnected()) {
    formNotice.textContent = "Nenhuma conta conectada. Você pode conferir a interpretação do briefing, mas precisará conectar o Google Slides ou o Canva antes de criar as artes.";
    formNotice.hidden = false;
  } else if (!status.aiConfigured) {
    formNotice.textContent = "Modo de teste ativo: o texto do briefing será preservado, mas posts fotográficos usarão imagens de exemplo.";
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

// Modelo escolhido por post. Fica com o item para sobreviver a uma nova
// interpretação do briefing sem perder o que já foi ajustado na tela.
function templateField(item, index) {
  const wrap = document.createElement("div");
  wrap.className = "brief-template";

  const id = `template-${index}`;
  const label = document.createElement("label");
  label.textContent = "Modelo";
  label.htmlFor = id;

  const select = document.createElement("select");
  select.id = id;
  select.dataset.itemId = item.id;
  for (const option of currentStatus?.templates || []) {
    const node = document.createElement("option");
    node.value = option.id;
    node.textContent = option.label;
    select.appendChild(node);
  }
  select.value = item.templateId || item.brief?.templateId || "auto";

  // Carrossel com várias telas não tem escolha: o modelo vem do próprio briefing.
  if (item.kind === "carousel") {
    select.value = "carousel";
    select.disabled = true;
    const note = document.createElement("span");
    note.className = "brief-meta";
    note.textContent = "definido pelas TELAS do briefing";
    wrap.append(label, select, note);
  } else {
    wrap.append(label, select);
  }

  select.addEventListener("change", () => { item.templateId = select.value; });
  item.templateId = select.value;
  return wrap;
}

function renderBriefItems(items) {
  parsedItems = items;
  briefList.replaceChildren();
  for (const [index, item] of items.entries()) {
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
    date.textContent = item.date || `POST ${index + 1}`;

    const copy = document.createElement("div");
    const title = document.createElement("div");
    title.className = "brief-title";
    title.textContent = item.title;
    const subtitle = document.createElement("div");
    subtitle.className = "brief-subtitle";
    subtitle.textContent = item.subtitle || "";
    subtitle.hidden = !item.subtitle;
    const meta = document.createElement("div");
    meta.className = "brief-meta";
    meta.textContent = item.kind === "carousel"
      ? `Carrossel · ${item.slideCount} telas · ${item.format}`
      : `Post único · ${item.format}`;
    copy.append(title, subtitle, meta, templateField(item, index));
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
  jobMessage.textContent = "Identificando títulos, subtítulos e telas…";
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

function renderProgress(job) {
  jobMessage.textContent = job.message;
  const currentIndex = stepOrder.indexOf(job.status);
  steps.forEach((step) => {
    const index = stepOrder.indexOf(step.dataset.step);
    step.classList.toggle("done", job.status === "done" || (currentIndex > index && currentIndex >= 0));
    step.classList.toggle("active", index === currentIndex);
    step.querySelector(".step-number").textContent = step.classList.contains("done") ? "✓" : String(index + 1);
  });
}

async function pollJob(id) {
  const deadline = Date.now() + 7 * 60_000;
  while (Date.now() < deadline) {
    const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    renderProgress(job);
    if (job.status === "done") return job;
    if (job.status === "failed") throw new Error(job.error || "Não foi possível criar o post");
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  throw new Error("A criação está demorando mais que o esperado. Verifique novamente em instantes.");
}

function captionButton(caption) {
  const button = document.createElement("button");
  button.className = "button ghost";
  button.type = "button";
  button.textContent = "Copiar legenda";
  button.disabled = !caption;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(caption || "");
      button.textContent = "Legenda copiada";
      setTimeout(() => { button.textContent = "Copiar legenda"; }, 1800);
    } catch {
      button.textContent = "Não foi possível copiar";
    }
  });
  return button;
}

function renderResult(job) {
  resultsList.replaceChildren();
  const destination = job.result.destination === "google" ? "Google Slides" : "Canva";

  for (const file of job.result.files) {
    const card = document.createElement("div");
    card.className = "result-item";

    const title = document.createElement("strong");
    title.textContent = file.title;

    const slides = file.posts.reduce((total, post) => total + post.slideCount, 0);
    const detail = document.createElement("p");
    detail.textContent = file.posts.length > 1
      ? `${file.posts.length} artes no mesmo arquivo · ${slides} ${slides === 1 ? "slide" : "slides"}.`
      : `${slides} ${slides === 1 ? "página editável criada" : "páginas editáveis criadas"}.`;
    card.append(title, detail);

    const actions = document.createElement("div");
    actions.className = "result-actions";
    const edit = document.createElement("a");
    edit.className = "button primary";
    edit.href = file.editUrl;
    edit.target = "_blank";
    edit.rel = "noopener noreferrer";
    edit.textContent = `Editar no ${destination}`;
    actions.appendChild(edit);
    // Com um post só, a legenda é uma: cabe ao lado do link.
    if (file.posts.length === 1) actions.appendChild(captionButton(file.posts[0].caption));
    card.appendChild(actions);

    // Com vários, cada arte tem a sua legenda e a sua posição no arquivo.
    if (file.posts.length > 1) {
      const list = document.createElement("div");
      list.className = "result-posts";
      let position = 1;
      for (const post of file.posts) {
        const row = document.createElement("div");
        row.className = "result-actions";
        const name = document.createElement("span");
        const range = post.slideCount > 1
          ? `slides ${position}–${position + post.slideCount - 1}`
          : `slide ${position}`;
        name.textContent = `${range} · ${post.title}`;
        row.append(name, captionButton(post.caption));
        list.appendChild(row);
        position += post.slideCount;
      }
      card.appendChild(list);
    }

    resultsList.appendChild(card);
  }
}

function renderFailure(error) {
  resultsList.replaceChildren();
  const card = document.createElement("div");
  card.className = "result-item error";
  const title = document.createElement("strong");
  title.textContent = "Não foi possível criar as artes";
  const detail = document.createElement("p");
  detail.textContent = error.message;
  card.append(title, detail);
  resultsList.appendChild(card);
}

createSelected.addEventListener("click", async () => {
  if (!anyDestinationConnected()) return;
  const selectedIds = new Set([...briefList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.dataset.itemId));
  const selected = parsedItems.filter((item) => selectedIds.has(item.id));
  if (!selected.length) return;

  createSelected.disabled = true;
  interpretBrief.disabled = true;
  jobError.hidden = true;
  resultsList.replaceChildren();
  result.hidden = false;

  // Uma requisição só: o servidor devolve as artes selecionadas no mesmo arquivo.
  const posts = selected.map((item) => ({
    ...item.brief,
    templateId: item.templateId || item.brief.templateId || "auto",
  }));

  try {
    const queued = await api("/api/jobs", { method: "POST", body: JSON.stringify({ posts }) });
    renderProgress(queued);
    const job = await pollJob(queued.id);
    renderResult(job);
    jobMessage.textContent = job.message;
  } catch (error) {
    renderFailure(error);
    jobMessage.textContent = "A criação não foi concluída.";
    if (/Canva|Google|conta conectada/i.test(error.message)) await refreshStatus().catch(() => {});
  } finally {
    interpretBrief.disabled = false;
    updateCreateButton();
  }
});

const query = new URLSearchParams(location.search);
if (query.has("connected") || query.has("google_connected") || query.has("error")) history.replaceState({}, "", "/");

refreshStatus().catch((error) => {
  loginView.hidden = true;
  appView.hidden = false;
  formNotice.textContent = `Não foi possível iniciar o agente: ${error.message}`;
  formNotice.className = "notice error";
  formNotice.hidden = false;
});
