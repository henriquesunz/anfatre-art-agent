import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  port: Number(process.env.PORT || process.env.APP_PORT || 3001),
  host: process.env.APP_HOST || "127.0.0.1",
  secureCookies: process.env.COOKIE_SECURE === "true",
};

const sessions = new Map();
const SESSION_COOKIE = "anfatre_session";
const CANVA_SCOPES = ["design:content:write", "design:meta:read", "profile:read"];

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
  return id ? { id, data: sessions.get(id) } : null;
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

function requireConfigured(res) {
  if (!config.clientId || !config.clientSecret) {
    json(res, 503, {
      error: "Configuração incompleta",
      message: "Crie app-v2/.env.local e preencha CANVA_CLIENT_SECRET antes de conectar.",
    });
    return false;
  }
  return true;
}

async function canvaTokenRequest(params) {
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error_description || "Falha ao obter token do Canva");
  return data;
}

async function validAccessToken(session) {
  if (!session?.tokens) throw new Error("Conta Canva ainda não conectada");
  if (Date.now() < session.tokens.expiresAt - 60_000) return session.tokens.accessToken;

  const refreshed = await canvaTokenRequest({
    grant_type: "refresh_token",
    refresh_token: session.tokens.refreshToken,
  });
  session.tokens = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in || 14_400) * 1000,
  };
  return session.tokens.accessToken;
}

async function startImport(accessToken) {
  const pptxPath = path.join(rootDir, "fixtures", "anfatre-template-library.pptx");
  const bytes = await fs.readFile(pptxPath);
  const metadata = {
    title_base64: Buffer.from("ANFATRE — biblioteca de posts editáveis", "utf8").toString("base64"),
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
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error?.message || "Canva recusou o arquivo");
  return data.job;
}

async function getImport(accessToken, jobId) {
  const response = await fetch(`https://api.canva.com/rest/v1/imports/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error?.message || "Falha ao consultar importação");
  return data.job;
}

async function waitForImport(accessToken, initialJob) {
  let job = initialJob;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (job.status === "success") return job;
    if (job.status === "failed") throw new Error(job.error?.message || "A importação falhou no Canva");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    job = await getImport(accessToken, job.id);
  }
  throw new Error("O Canva demorou mais de 60 segundos para importar o arquivo");
}

async function serveHome(res) {
  const html = await fs.readFile(path.join(rootDir, "static", "index.html"), "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
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

    if (req.method === "GET" && url.pathname === "/api/status") {
      const session = getSession(req);
      return json(res, 200, {
        configured: Boolean(config.clientId && config.clientSecret),
        connected: Boolean(session?.data?.tokens),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/canva/connect") {
      if (!requireConfigured(res)) return;
      const sessionId = randomToken(32);
      const codeVerifier = randomToken(72);
      const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
      const state = randomToken(48);

      sessions.set(sessionId, { state, codeVerifier, createdAt: Date.now(), tokens: null });
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

      return redirect(res, authUrl.toString(), {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${config.secureCookies ? "; Secure" : ""}`,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/canva/callback") {
      if (!requireConfigured(res)) return;
      const session = getSession(req);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!session?.data || !code || !state || state !== session.data.state) {
        return redirect(res, "/?error=oauth_state");
      }

      const tokenData = await canvaTokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: session.data.codeVerifier,
        redirect_uri: config.redirectUri,
      });
      session.data.tokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + Number(tokenData.expires_in || 14_400) * 1000,
      };
      delete session.data.state;
      delete session.data.codeVerifier;
      return redirect(res, "/?connected=1");
    }

    if (req.method === "POST" && url.pathname === "/api/canva/import") {
      if (!requireConfigured(res)) return;
      const session = getSession(req);
      if (!session?.data?.tokens) return json(res, 401, { error: "Conecte sua conta Canva primeiro" });
      const accessToken = await validAccessToken(session.data);
      const imported = await waitForImport(accessToken, await startImport(accessToken));
      const design = imported.result?.designs?.[0];
      if (!design?.urls?.edit_url) throw new Error("O Canva importou, mas não devolveu um link de edição");
      return json(res, 200, {
        designId: design.id,
        title: design.title,
        editUrl: design.urls.edit_url,
        viewUrl: design.urls.view_url,
        thumbnail: design.thumbnail?.url,
      });
    }

    return json(res, 404, { error: "Rota não encontrada" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Erro interno" });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`ANFATRE Art Agent escutando em ${config.host}:${config.port}`);
  if (!config.clientSecret) console.log("Configuração pendente: preencha CANVA_CLIENT_SECRET em app-v2/.env.local");
});
