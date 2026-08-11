const statusEl = document.getElementById("status");
const connectEl = document.getElementById("connect");
const importEl = document.getElementById("import");
const resultEl = document.getElementById("result");
const previewEl = document.getElementById("preview");

async function refreshStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();
  if (!status.configured) {
    statusEl.textContent = "Falta adicionar o Client Secret no arquivo .env.local.";
    connectEl.style.pointerEvents = "none";
    connectEl.style.opacity = ".45";
    return;
  }
  if (status.connected) {
    statusEl.textContent = "Canva conectado. Já podemos testar a importação.";
    connectEl.textContent = "Canva conectado";
    importEl.disabled = false;
  } else {
    statusEl.textContent = "Configuração pronta. Conecte sua conta Canva.";
  }
}

importEl.addEventListener("click", async () => {
  importEl.disabled = true;
  resultEl.innerHTML = "";
  previewEl.style.display = "none";
  statusEl.textContent = "Enviando os seis modelos e aguardando o Canva…";
  try {
    const response = await fetch("/api/canva/import", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha na importação");
    statusEl.textContent = "Importação concluída. A biblioteca com seis páginas está na sua conta Canva.";
    const link = document.createElement("a");
    link.className = "button primary";
    link.href = data.editUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Editar no Canva";
    resultEl.appendChild(link);
    if (data.thumbnail) {
      previewEl.src = data.thumbnail;
      previewEl.style.display = "block";
    }
  } catch (error) {
    statusEl.textContent = `Erro: ${error.message}`;
    importEl.disabled = false;
  }
});

refreshStatus().catch((error) => {
  statusEl.textContent = `Erro ao iniciar: ${error.message}`;
});
