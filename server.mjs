import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDesignPptx, templateNeedsPhoto, TEMPLATE_OPTIONS } from "./lib/generate-design.mjs";
import { parsePastedBriefing } from "./lib/parse-briefing.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  const envPath = path.join(rootDir, ".env.local");
  try {
    const text = await fs.readFile(envPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadEnv();

const config = {
  clientId: process.env.CANVA_CLIENT_ID || "OC-AZ_x1LKGTx3w",
  clientSecret: process.env.CANVA_CLIENT_SECRET || "",
  redirectUri: process.env.CANVA_REDIRECT_URI || "http://127.0.0.1:3001/api/canva/callback",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  openaiImageQuality: process.env.OPENAI_IMAGE_QUALITY || "medium",
  appPassword: process.env.AGENT_ACCESS_PASSWORD || "",
  port: Number(process.env.PORT || process.env.APP_PORT || 3001),
  host: process.env.APP_HOST || "127.0.0.1",
  secureCookies: process.env.COOKIE_SECURE === "true",
};

const sessions = new Map();
const jobs = new Map();
const loginAttempts = new Map();
let canvaTokens = null;

const SESSION_COOKIE = "anfatre_session";
const SESSION_MAX_AGE = 60 * 60 * 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const CANVA_SCOPES = ["design:content:write", "design:meta:read", "profile:read"];
const VALID_TEMPLATES = new Set(TEMPLATE_OPTIONS.filter((item) => item.id !== "auto").map((item) => item.id));

function base64Url(buffer) {
  return buffer.toString("base64url");
}

function randomToken(bytes = 48) {
  return base64Url(crypto.randomBytes(bytes));
}

function parseCookies(req) {
  const cookies = {};
  for (const pair of (req.headers.cookie || "").split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return cookies;
}

function getSession(req) {
  const id = parseCookies(req)[SESSION_COOKIE];
  const data = id ? sessions.get(id) : null;
  if (!id || !data) return null;
  if (Date.now() - data.createdAt > SESSION_MAX_AGE * 1000) {
    sessions.delete(id);
    return null;
  }
  return { id, data };
}

function sessionCookie(id) {
  return `${SESSION_COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${config.secureCookies ? "; Secure" : ""}`;
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...extraHeaders });
  res.end();
}

function isAuthenticated(req) {
  if (!config.appPassword) return true;
  return Boolean(getSession(req)?.data?.authenticated);
}

function requireAuthenticated(req, res) {
  if (isAuthenticated(req)) return true;
  json(res, 401, { error: "Faça login para usar o agente" });
  return false;
}

function requireConfigured(res) {
  if (!config.clientId || !config.clientSecret) {
    json(res, 503, { error: "A integração do Canva ainda não foi configurada" });
    return false;
  }
  return true;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function loginKey(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function recordFailedLogin(req) {
  const key = loginKey(req);
  const previous = loginAttempts.get(key);
  const attempt = !previous || Date.now() > previous.resetAt
    ? { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS }
    : { ...previous, count: previous.count + 1 };
  loginAttempts.set(key, attempt);
  return attempt;
}

function loginBlocked(req) {
  const attempt = loginAttempts.get(loginKey(req));
  if (!attempt || Date.now() > attempt.resetAt) return null;
  return attempt.count >= LOGIN_MAX_ATTEMPTS ? attempt : null;
}

async function readJson(req, limit = 128_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("O briefing ultrapassou o limite permitido");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Dados do formulário inválidos");
  }
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeBrief(input) {
  const slides = (Array.isArray(input.slides) ? input.slides : []).slice(0, 20).map((slide, index) => ({
    number: Number(slide.number) || index + 1,
    title: cleanText(slide.title, 180),
    body: cleanMultiline(slide.body, 2400),
  })).filter((slide) => slide.title || slide.body);
  const brief = {
    date: cleanText(input.date, 20),
    title: cleanText(input.title, 180),
    jobTitle: cleanText(input.jobTitle, 220),
    objective: cleanText(input.objective, 50),
    audience: cleanText(input.audience, 120),
    mainMessage: cleanMultiline(input.mainMessage, 20_000),
    cta: cleanText(input.cta, 180),
    visualDirection: cleanText(input.visualDirection, 500),
    templateId: cleanText(input.templateId, 40) || "auto",
    generateImage: input.generateImage !== false,
    format: cleanText(input.format, 80) || "Timeline Instagram",
    slides,
  };
  if (brief.slides.length > 1) brief.templateId = "carousel";
  if (!brief.jobTitle) throw new Error("Informe um nome para este trabalho");
  if (!brief.mainMessage) throw new Error("Descreva a mensagem principal do post");
  if (brief.templateId !== "auto" && !VALID_TEMPLATES.has(brief.templateId)) throw new Error("Modelo de post inválido");
  return brief;
}

async function canvaTokenRequest(params) {
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error_description || "Falha ao obter autorização do Canva");
  return data;
}

async function validAccessToken() {
  if (!canvaTokens) throw new Error("A conta Canva precisa ser conectada");
  if (Date.now() < canvaTokens.expiresAt - 60_000) return canvaTokens.accessToken;

  const refreshed = await canvaTokenRequest({ grant_type: "refresh_token", refresh_token: canvaTokens.refreshToken });
  canvaTokens = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in || 14_400) * 1000,
  };
  return canvaTokens.accessToken;
}

async function startImport(accessToken, bytes, title) {
  const metadata = {
    title_base64: Buffer.from(title, "utf8").toString("base64"),
    mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  const response = await fetch("https://api.canva.com/rest/v1/imports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Import-Metadata": JSON.stringify(metadata),
    },
    body: bytes,
    signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error?.message || "O Canva recusou o arquivo");
  return data.job;
}

async function getImport(accessToken, jobId) {
  const response = await fetch(`https://api.canva.com/rest/v1/imports/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error?.message || "Falha ao consultar a importação");
  return data.job;
}

async function waitForImport(accessToken, initialJob) {
  let job = initialJob;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (job.status === "success") return job;
    if (job.status === "failed") throw new Error(job.error?.message || "A importação falhou no Canva");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    job = await getImport(accessToken, job.id);
  }
  throw new Error("O Canva demorou mais de 90 segundos para importar o post");
}

function chooseFallbackTemplate(brief) {
  if (brief.slides.length > 1) return "carousel";
  if (brief.templateId !== "auto") return brief.templateId;
  const objective = brief.objective.toLowerCase();
  const message = brief.mainMessage.toLowerCase();
  if (objective.includes("institucional")) return "institutional";
  if (objective.includes("carrossel") || message.includes("vantagens") || message.includes("passos")) return "carousel";
  if (message.includes("?") || objective.includes("engaj")) return "question";
  if (objective.includes("campanha") || objective.includes("marca")) return "photo-signature";
  return "photo-green";
}

function splitHeadline(value) {
  const title = cleanText(value, 150);
  if (!title) return { intro: "CONTEÚDO ANFATRE", highlight: "INFORMAÇÃO QUE FAZ A DIFERENÇA." };
  const colon = title.indexOf(":");
  if (colon > 8 && colon < 62) {
    return {
      intro: cleanText(title.slice(0, colon), 78),
      highlight: cleanText(title.slice(colon + 1), 86).toUpperCase(),
    };
  }
  const words = title.split(" ");
  if (words.length < 6) return { intro: "CONTEÚDO ANFATRE", highlight: title.toUpperCase() };
  const cut = Math.max(2, Math.ceil(words.length * 0.42));
  return {
    intro: cleanText(words.slice(0, cut).join(" "), 78),
    highlight: cleanText(words.slice(cut).join(" "), 86).toUpperCase(),
  };
}

function fallbackPlan(brief) {
  const templateId = chooseFallbackTemplate(brief);
  const headline = splitHeadline(brief.title || brief.slides[0]?.title || brief.jobTitle);
  return {
    templateId,
    jobTitle: brief.jobTitle,
    sourceTitle: brief.title,
    intro: headline.intro,
    highlight: headline.highlight,
    closing: cleanText(brief.cta || brief.mainMessage, 120),
    caption: cleanText(`${brief.mainMessage}${brief.cta ? `\n\n${brief.cta}` : ""}`, 1200),
    imagePrompt: cleanText(brief.visualDirection || brief.mainMessage, 700),
    rationale: "Composição criada no modo de teste, sem geração de copy por IA.",
    usedAI: false,
    slides: brief.slides,
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  throw new Error("A IA não devolveu um plano de conteúdo válido");
}

async function analyzeBrief(brief) {
  if (!config.openaiApiKey) return fallbackPlan(brief);
  const allowed = [...VALID_TEMPLATES];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.openaiTextModel,
      store: false,
      instructions: [
        "Você é o planejador de conteúdo da ANFATRE RV, associação brasileira do setor de veículos recreativos e rebocáveis.",
        "Transforme o briefing em texto curto, claro, confiável e em português do Brasil.",
        "Não invente dados, leis, números, associados ou certificações. Se o briefing não trouxer um fato, não acrescente.",
        "Escolha somente um modelo permitido. Respeite os limites: intro até 78 caracteres, highlight até 54, closing até 120.",
        "Intro e highlight precisam se complementar. Nunca repita o título inteiro nos dois campos e não reformule a mesma frase duas vezes.",
        "Limites seguros por modelo: photo-green/photo-blue/photo-signature: intro até 60 e highlight até 46; question: highlight até 44 e closing até 95; institutional: intro até 34 e highlight até 48; carousel: intro até 46 e highlight até 40.",
        "Prefira frases curtas que possam ser quebradas em duas linhas. Não insira quebras no meio de palavras.",
        "Headlines devem funcionar em caixa alta. O prompt fotográfico não pode pedir textos, marcas ou logotipos dentro da imagem.",
        "Quando o briefing já trouxer várias TELAS, escolha carousel, preserve todos os fatos fornecidos e use o título da TELA 1 como capa.",
      ].join(" "),
      input: JSON.stringify({ ...brief, allowedTemplates: allowed }),
      text: {
        format: {
          type: "json_schema",
          name: "anfatre_post_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              templateId: { type: "string", enum: allowed },
              intro: { type: "string" },
              highlight: { type: "string" },
              closing: { type: "string" },
              caption: { type: "string" },
              imagePrompt: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["templateId", "intro", "highlight", "closing", "caption", "imagePrompt", "rationale"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "A IA não conseguiu interpretar o briefing");
  const plan = JSON.parse(extractResponseText(data));
  if (brief.templateId !== "auto" || brief.slides.length > 1) plan.templateId = brief.templateId;
  return {
    ...plan,
    jobTitle: brief.jobTitle,
    sourceTitle: brief.title,
    intro: cleanText(plan.intro, 78),
    highlight: cleanText(plan.highlight, 54).toUpperCase(),
    closing: cleanText(plan.closing, 120),
    caption: cleanText(plan.caption, 1600),
    imagePrompt: cleanText(plan.imagePrompt, 900),
    rationale: cleanText(plan.rationale, 400),
    usedAI: true,
    slides: brief.slides,
  };
}

async function generateImage(plan, brief) {
  if (!config.openaiApiKey || !brief.generateImage || !templateNeedsPhoto(plan.templateId)) return null;
  const prompt = [
    "Fotografia publicitária realista e premium para um post vertical 4:5 da ANFATRE RV.",
    plan.imagePrompt,
    brief.visualDirection,
    "Contexto brasileiro, veículos recreativos ou rebocáveis tecnicamente plausíveis, luz natural, acabamento profissional.",
    "Composição com espaço visual limpo na região superior central para receber um painel editorial.",
    "Não incluir texto, letras, números, logotipos, marcas d'água, placas legíveis nem elementos gráficos.",
  ].filter(Boolean).join(" ");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.openaiImageModel,
      prompt,
      size: "1024x1536",
      quality: config.openaiImageQuality,
      output_format: "jpeg",
      output_compression: 86,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "A IA não conseguiu gerar a fotografia");
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) throw new Error("A IA terminou sem devolver a fotografia");
  return { base64, mimeType: "image/jpeg" };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
    plan: job.plan || null,
    result: job.result || null,
    error: job.error || null,
  };
}

async function runJob(job) {
  try {
    job.status = "planning";
    job.message = config.openaiApiKey ? "Interpretando o briefing e preparando a copy…" : "Preparando o post no modo de teste…";
    job.plan = await analyzeBrief(job.brief);

    if (templateNeedsPhoto(job.plan.templateId)) {
      job.status = "image";
      job.message = config.openaiApiKey && job.brief.generateImage ? "Criando a fotografia do post…" : "Selecionando a fotografia de teste…";
    }
    const image = await generateImage(job.plan, job.brief);

    job.status = "design";
    job.message = "Montando o layout editável da ANFATRE…";
    const bytes = await generateDesignPptx(job.plan, image);

    job.status = "canva";
    job.message = "Enviando o post para o Canva…";
    const accessToken = await validAccessToken();
    const imported = await waitForImport(accessToken, await startImport(accessToken, bytes, `ANFATRE — ${job.brief.jobTitle}`));
    const design = imported.result?.designs?.[0];
    if (!design?.urls?.edit_url) throw new Error("O Canva importou o post, mas não devolveu o link de edição");

    job.status = "done";
    job.message = "Post criado e pronto para revisão no Canva.";
    job.result = {
      designId: design.id,
      title: design.title,
      editUrl: design.urls.edit_url,
      viewUrl: design.urls.view_url,
      caption: job.plan.caption,
    };
  } catch (error) {
    console.error("Falha no trabalho", job.id, error);
    job.status = "failed";
    job.message = "Não foi possível concluir este post.";
    job.error = error.message || "Erro interno";
  }
}

async function serveHome(res) {
  const html = await fs.readFile(path.join(rootDir, "static", "index.html"), "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${config.port}`}`);

    if (req.method === "GET" && url.pathname === "/") return await serveHome(res);
    if (req.method === "GET" && url.pathname === "/app.js") {
      const js = await fs.readFile(path.join(rootDir, "static", "app.js"), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(js);
    }

    if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true });

    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, {
        configured: Boolean(config.clientId && config.clientSecret),
        connected: Boolean(canvaTokens),
        aiConfigured: Boolean(config.openaiApiKey),
        authRequired: Boolean(config.appPassword),
        authenticated: isAuthenticated(req),
        templates: TEMPLATE_OPTIONS,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const blocked = loginBlocked(req);
      if (blocked) {
        const retryAfter = Math.max(1, Math.ceil((blocked.resetAt - Date.now()) / 1000));
        return json(res, 429, { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { "Retry-After": String(retryAfter) });
      }
      const body = await readJson(req);
      if (config.appPassword && !constantTimeEqual(body.password || "", config.appPassword)) {
        recordFailedLogin(req);
        return json(res, 401, { error: "Senha incorreta" });
      }
      loginAttempts.delete(loginKey(req));
      const sessionId = randomToken(32);
      sessions.set(sessionId, { authenticated: true, createdAt: Date.now() });
      return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(sessionId) });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      const session = getSession(req);
      if (session) sessions.delete(session.id);
      return json(res, 200, { ok: true }, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${config.secureCookies ? "; Secure" : ""}` });
    }

    if (req.method === "GET" && url.pathname === "/api/canva/connect") {
      if (!requireAuthenticated(req, res) || !requireConfigured(res)) return;
      let session = getSession(req);
      let sessionId = session?.id;
      if (!session?.data) {
        sessionId = randomToken(32);
        sessions.set(sessionId, { authenticated: true, createdAt: Date.now() });
        session = { id: sessionId, data: sessions.get(sessionId) };
      }
      const codeVerifier = randomToken(72);
      const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
      const state = randomToken(48);
      Object.assign(session.data, { state, codeVerifier });

      const authUrl = new URL("https://www.canva.com/api/oauth/authorize");
      authUrl.search = new URLSearchParams({
        code_challenge: codeChallenge,
        code_challenge_method: "s256",
        scope: CANVA_SCOPES.join(" "),
        response_type: "code",
        client_id: config.clientId,
        state,
        redirect_uri: config.redirectUri,
      });
      return redirect(res, authUrl.toString(), { "Set-Cookie": sessionCookie(sessionId) });
    }

    if (req.method === "GET" && url.pathname === "/api/canva/callback") {
      if (!requireConfigured(res)) return;
      const session = getSession(req);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!session?.data || !code || !state || state !== session.data.state) return redirect(res, "/?error=oauth_state");

      const tokenData = await canvaTokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: session.data.codeVerifier,
        redirect_uri: config.redirectUri,
      });
      canvaTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + Number(tokenData.expires_in || 14_400) * 1000,
      };
      delete session.data.state;
      delete session.data.codeVerifier;
      return redirect(res, "/?connected=1");
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      if (!requireAuthenticated(req, res)) return;
      if (!canvaTokens) return json(res, 409, { error: "Conecte a conta Canva antes de criar o post" });
      const brief = normalizeBrief(await readJson(req));
      const id = randomToken(12);
      const job = { id, brief, status: "queued", message: "Briefing recebido.", createdAt: new Date().toISOString() };
      jobs.set(id, job);
      setImmediate(() => runJob(job));
      return json(res, 202, publicJob(job));
    }

    if (req.method === "POST" && url.pathname === "/api/briefings/parse") {
      if (!requireAuthenticated(req, res)) return;
      const body = await readJson(req);
      const rawText = cleanMultiline(body.text, 100_000);
      return json(res, 200, { items: parsePastedBriefing(rawText) });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      if (!requireAuthenticated(req, res)) return;
      const id = decodeURIComponent(url.pathname.slice("/api/jobs/".length));
      const job = jobs.get(id);
      if (!job) return json(res, 404, { error: "Trabalho não encontrado" });
      return json(res, 200, publicJob(job));
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      if (!requireAuthenticated(req, res)) return;
      return json(res, 200, { jobs: [...jobs.values()].slice(-12).reverse().map(publicJob) });
    }

    if (req.method === "POST" && url.pathname === "/api/canva/import-library") {
      if (!requireAuthenticated(req, res) || !requireConfigured(res)) return;
      const accessToken = await validAccessToken();
      const bytes = await fs.readFile(path.join(rootDir, "fixtures", "anfatre-template-library.pptx"));
      const imported = await waitForImport(accessToken, await startImport(accessToken, bytes, "ANFATRE — biblioteca de posts editáveis"));
      const design = imported.result?.designs?.[0];
      if (!design?.urls?.edit_url) throw new Error("O Canva importou, mas não devolveu um link de edição");
      return json(res, 200, { designId: design.id, editUrl: design.urls.edit_url, viewUrl: design.urls.view_url });
    }

    return json(res, 404, { error: "Rota não encontrada" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Erro interno" });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`ANFATRE Art Agent escutando em ${config.host}:${config.port}`);
  if (!config.clientSecret) console.log("Configuração pendente: CANVA_CLIENT_SECRET");
  if (!config.openaiApiKey) console.log("Modo de teste ativo: OPENAI_API_KEY não configurada");
  if (!config.appPassword) console.log("Acesso sem senha: configure AGENT_ACCESS_PASSWORD antes de liberar para o time");
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE * 1000) sessions.delete(id);
  }
  for (const [id, job] of jobs) {
    if (now - Date.parse(job.createdAt) > 24 * 60 * 60 * 1000) jobs.delete(id);
  }
  for (const [key, attempt] of loginAttempts) {
    if (now > attempt.resetAt) loginAttempts.delete(key);
  }
}, 30 * 60 * 1000);
cleanupTimer.unref();
