import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSlidesRequests } from "./generate-slides.mjs";
import { masterLineCount, normalizedText } from "./generate-design.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, "..");

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive.file",
];

async function googleFetch(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 60_000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error?.message || `Google API respondeu ${response.status}`);
  return data;
}

async function uploadDriveImage(accessToken, name, buffer, mime) {
  const boundary = `anfatre${Date.now()}${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: `anfatre-tmp-${name}` });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const file = await googleFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    timeout: 120_000,
  });
  // O createImage do Slides precisa conseguir baixar a URL; liberamos leitura por link
  // apenas no arquivo temporário, que é apagado depois que o Slides copia a imagem.
  await googleFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return { id: file.id, url: `https://drive.google.com/uc?export=download&id=${file.id}` };
}

async function deleteDriveFile(accessToken, fileId) {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Arquivo temporário; se a limpeza falhar não compromete o post.
  }
}

const MASTER_TEMPLATE_NAME = "ANFATRE — master de posts (não apagar)";
let cachedMasterTemplateId = null;

// Slides do ppt-mestre (1-based): tom × ordem × nº de linhas do texto de apoio.
const MASTER_SLIDE_INDEX = {
  green: { introFirst: [1, 2, 3], highlightFirst: [4, 5, 6] },
  blue: { introFirst: [9, 10, 11], highlightFirst: [12, 13, 14] },
};

async function uploadPptxAsPresentation(accessToken, name, bytes) {
  const boundary = `anfatre${Date.now()}pptx`;
  const metadata = JSON.stringify({ name, mimeType: "application/vnd.google-apps.presentation" });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await googleFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    timeout: 180_000,
  });
  return created.id;
}

async function ensureMasterTemplate(accessToken) {
  if (cachedMasterTemplateId) return cachedMasterTemplateId;
  const query = encodeURIComponent(`name = '${MASTER_TEMPLATE_NAME}' and trashed = false`);
  const found = await googleFetch(accessToken, `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {});
  if (found.files?.length) {
    cachedMasterTemplateId = found.files[0].id;
    return cachedMasterTemplateId;
  }
  const bytes = fs.readFileSync(path.join(rootDir, "fixtures", "ppt-mestre.pptx"));
  cachedMasterTemplateId = await uploadPptxAsPresentation(accessToken, MASTER_TEMPLATE_NAME, bytes);
  return cachedMasterTemplateId;
}

function shapeText(element) {
  const parts = [];
  for (const item of element.shape?.text?.textElements || []) {
    if (item.textRun?.content) parts.push(item.textRun.content);
  }
  return parts.join("");
}

function shapeTextStyle(element) {
  for (const item of element.shape?.text?.textElements || []) {
    if (item.textRun?.style) return item.textRun.style;
  }
  return null;
}

function elementSizePt(element) {
  const toPt = (dim) => {
    if (!dim) return 0;
    return dim.unit === "EMU" ? dim.magnitude / 12700 : dim.magnitude;
  };
  return {
    width: toPt(element.size?.width) * (element.transform?.scaleX ?? 1),
    height: toPt(element.size?.height) * (element.transform?.scaleY ?? 1),
  };
}

// Encolhe a fonte apenas o necessário para o texto caber na caixa do mestre,
// deixando o Slides quebrar as linhas naturalmente como no arquivo original.
function fitFontSize(text, widthPt, heightPt, baseSize) {
  const clean = normalizedText(text);
  const longestWord = Math.max(...clean.split(" ").map((word) => word.length), 1);
  for (let size = Math.round(baseSize); size >= 14; size -= 1) {
    const charWidth = 0.62 * size;
    const charsPerLine = Math.max(1, Math.floor((widthPt - 10) / charWidth));
    if (longestWord > charsPerLine) continue;
    const lines = Math.ceil(clean.length / charsPerLine);
    if (lines * size * 1.3 <= heightPt + 6) return size;
  }
  return 14;
}

async function deliverPhotoFromMaster(accessToken, plan, image, title, uploader) {
  const tone = plan.templateId === "photo-blue" ? "blue" : "green";
  const intro = normalizedText(plan.intro).toUpperCase();
  const highlight = normalizedText(plan.highlight).toUpperCase();
  const highlightFirst = plan.copyOrder === "highlight-intro";
  const introLines = Math.max(1, masterLineCount(intro, 35));
  const highlightLines = masterLineCount(highlight, 17);
  const variant = introLines >= 3 || highlightLines >= 3 ? 3 : introLines >= 2 ? 2 : 1;
  const slideNumber = MASTER_SLIDE_INDEX[tone][highlightFirst ? "highlightFirst" : "introFirst"][variant - 1];

  const templateId = await ensureMasterTemplate(accessToken);
  const copied = await googleFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${templateId}/copy?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: title }),
    timeout: 120_000,
  });
  const presentationId = copied.id;

  const presentation = await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}`, { timeout: 60_000 });
  const slides = presentation.slides || [];
  const target = slides[slideNumber - 1];
  if (!target) throw new Error("O template mestre no Google não tem o slide esperado");

  const requests = [];
  for (const slide of slides) {
    if (slide.objectId !== target.objectId) requests.push({ deleteObject: { objectId: slide.objectId } });
  }

  let photoElementId = null;
  let photoArea = 0;
  for (const element of target.pageElements || []) {
    if (element.image) {
      const { width, height } = elementSizePt(element);
      if (width * height > photoArea) {
        photoArea = width * height;
        photoElementId = element.objectId;
      }
      continue;
    }
    const existing = normalizedText(shapeText(element));
    if (!existing) continue;
    const isIntro = /TEXTO COM/i.test(existing);
    const replacement = isIntro ? intro : highlight;
    const originalStyle = shapeTextStyle(element) || {};
    const baseSize = originalStyle.fontSize?.magnitude || (isIntro ? 21 : 54);
    const { width, height } = elementSizePt(element);
    const fitted = replacement ? fitFontSize(replacement, width, height, baseSize) : baseSize;

    // O texto do mestre tem quebras de parágrafo, então substituição por busca não
    // funciona: apagamos tudo e inserimos o novo texto reaplicando o estilo original.
    requests.push({ deleteText: { objectId: element.objectId, textRange: { type: "ALL" } } });
    if (replacement) {
      requests.push({ insertText: { objectId: element.objectId, text: replacement, insertionIndex: 0 } });
      const style = { ...originalStyle, fontSize: { magnitude: fitted, unit: "PT" } };
      const fields = Object.keys(style).join(",");
      requests.push({
        updateTextStyle: {
          objectId: element.objectId,
          style,
          textRange: { type: "ALL" },
          fields,
        },
      });
    }
  }

  if (image?.base64 && photoElementId) {
    const url = await uploader("foto-post.jpg", Buffer.from(image.base64, "base64"), image.mimeType || "image/jpeg");
    requests.push({ replaceImage: { imageObjectId: photoElementId, url, imageReplaceMethod: "CENTER_CROP" } });
  }

  await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
    timeout: 120_000,
  });

  return {
    designId: presentationId,
    title,
    editUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
    viewUrl: `https://docs.google.com/presentation/d/${presentationId}/preview`,
  };
}

export async function deliverToGoogleSlides(accessToken, plan, image, title) {
  const uploaded = [];
  const uploader = async (name, buffer, mime) => {
    const file = await uploadDriveImage(accessToken, name, buffer, mime);
    uploaded.push(file.id);
    return file.url;
  };

  try {
    // Capas fotográficas verde/azul: cópia direta do deck mestre convertido — o layout
    // e as fontes nunca são redesenhados, só o texto e a foto são substituídos.
    if (["photo-green", "photo-blue"].includes(plan.templateId)) {
      return await deliverPhotoFromMaster(accessToken, plan, image, title, uploader);
    }

    const requests = await generateSlidesRequests(plan, image, uploader);

    // A Slides API ignora pageSize no presentations.create; a única forma de obter a
    // página 4:5 é converter um PPTX em branco 10"x12,5" pelo Drive — a conversão
    // preserva o tamanho e o arquivo vazio não carrega nenhum texto ou fonte.
    const blankBytes = fs.readFileSync(path.join(rootDir, "fixtures", "blank-4x5.pptx"));
    const boundary = `anfatre${Date.now()}blank`;
    const metadata = JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.presentation" });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`),
      blankBytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const created = await googleFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
      timeout: 120_000,
    });
    const presentationId = created.id;

    const presentation = await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=slides.objectId`, {
      timeout: 60_000,
    });
    const importedSlideIds = (presentation.slides || []).map((slide) => slide.objectId);
    const allRequests = [
      ...requests,
      ...importedSlideIds.map((objectId) => ({ deleteObject: { objectId } })),
    ];

    await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: allRequests }),
      timeout: 120_000,
    });

    return {
      designId: presentationId,
      title,
      editUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      viewUrl: `https://docs.google.com/presentation/d/${presentationId}/preview`,
    };
  } finally {
    for (const fileId of uploaded) await deleteDriveFile(accessToken, fileId);
  }
}
