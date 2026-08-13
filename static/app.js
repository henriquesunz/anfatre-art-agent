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
const templateSelect = document.getElementById("templateId");
const submitBrief = document.getElementById("submit-brief");
const formNotice = document.getElementById("form-notice");
const jobMessage = document.getElementById("job-message");
const jobError = document.getElementById("job-error");
const result = document.getElementById("result");
const templateTag = document.getElementById("template-tag");
const caption = document.getElementById("caption");
const editCanva = document.getElementById("edit-canva");
const copyCaption = document.getElementById("copy-caption");
const steps = [...document.querySelectorAll(".step")];

let currentStatus = null;
let currentCaption = "";

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

function renderStatus(status) {
  currentStatus = status;
  headerStatus.innerHTML = [
    statusPill("Canva conectado", status.connected, "Canva desconectado"),
    statusPill("IA ativa", status.aiConfigured, "Modo de teste"),
  ].join("");

  templateSelect.innerHTML = "";
  for (const template of status.templates || []) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    templateSelect.appendChild(option);
  }

  if (status.connected) {
    canvaTitle.textContent = "Canva conectado";
    canvaCopy.textContent = "Os novos posts serão criados na conta autorizada.";
    connectCanva.textContent = "Reconectar conta";
    connectCanva.className = "button ghost";
  } else {
    canvaTitle.textContent = "Conecte o Canva";
    canvaCopy.textContent = "Uma pessoa autoriza a conta; depois o agente usa essa conexão para criar os editáveis.";
    connectCanva.textContent = "Conectar Canva";
    connectCanva.className = "button accent";
  }
  submitBrief.disabled = !status.connected;

  if (!status.connected) {
    formNotice.textContent = "Conecte a conta Canva acima antes de enviar o primeiro briefing.";
    formNotice.hidden = false;
  } else if (!status.aiConfigured) {
    formNotice.textContent = "Modo de teste ativo: o fluxo e os layouts funcionam, mas ainda usam copy direta do briefing e fotografias aprovadas. A IA será ativada com uma chave da OpenAI API.";
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

const stepOrder = ["planning", "image", "design", "canva", "done"];

function renderProgress(job) {
  jobMessage.textContent = job.message;
  const currentIndex = stepOrder.indexOf(job.status);
  steps.forEach((step) => {
    const index = stepOrder.indexOf(step.dataset.step);
    step.classList.toggle("done", job.status === "done" || (currentIndex > index && currentIndex >= 0));
    step.classList.toggle("active", index === currentIndex);
    if (step.classList.contains("done")) step.querySelector(".step-number").textContent = "✓";
    else step.querySelector(".step-number").textContent = String(index + 1);
  });
}

function templateLabel(id) {
  return currentStatus?.templates?.find((item) => item.id === id)?.label || id;
}

function showResult(job) {
  currentCaption = job.result.caption || "";
  templateTag.textContent = templateLabel(job.plan?.templateId);
  caption.textContent = currentCaption || "Legenda não gerada no modo atual.";
  editCanva.href = job.result.editUrl;
  result.hidden = false;
}

async function pollJob(id) {
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    renderProgress(job);
    if (job.status === "done") return showResult(job);
    if (job.status === "failed") throw new Error(job.error || "Não foi possível criar o post");
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  throw new Error("A criação está demorando mais que o esperado. Verifique novamente em instantes.");
}

briefForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentStatus?.connected) return;
  submitBrief.disabled = true;
  result.hidden = true;
  jobError.hidden = true;
  steps.forEach((step) => step.classList.remove("done", "active"));
  jobMessage.textContent = "Enviando briefing…";

  const data = Object.fromEntries(new FormData(briefForm).entries());
  data.generateImage = document.getElementById("generateImage").checked;
  try {
    const job = await api("/api/jobs", { method: "POST", body: JSON.stringify(data) });
    renderProgress(job);
    await pollJob(job.id);
  } catch (error) {
    jobError.textContent = error.message;
    jobError.hidden = false;
    jobMessage.textContent = "O trabalho foi interrompido.";
    if (/Canva/i.test(error.message)) await refreshStatus().catch(() => {});
  } finally {
    submitBrief.disabled = !currentStatus?.connected;
  }
});

copyCaption.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentCaption);
    copyCaption.textContent = "Legenda copiada";
    setTimeout(() => { copyCaption.textContent = "Copiar legenda"; }, 1800);
  } catch {
    copyCaption.textContent = "Selecione e copie acima";
  }
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
