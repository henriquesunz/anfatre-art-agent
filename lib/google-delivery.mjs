import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePlanPages, generateSlidesRequests } from "./generate-slides.mjs";
import { fitPhotoMasterPanel, normalizedText } from "./generate-design.mjs";
import { fitTextToBox } from "./montserrat-metrics.mjs";

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
// Numeração de `fixtures/ppt-mestre.pptx` (15 slides) — o arquivo enviado ao Drive
// como template. NÃO confundir com `fixtures/anfatre-production-master.pptx`
// (22 slides), usado pelo gerador de PPTX: as posições não coincidem, e só o de
// produção tem o layout de copy longa. Aqui não existe `longCopy`.
export const MASTER_SLIDE_INDEX = {
  green: { introFirst: [1, 2, 3], highlightFirst: [4, 5, 6] },
  blue: { introFirst: [9, 10, 11], highlightFirst: [12, 13, 14] },
};

export const MASTER_TEMPLATE_FIXTURE = "ppt-mestre.pptx";

export function masterSlideNumber(tone, highlightFirst, variant) {
  const order = MASTER_SLIDE_INDEX[tone][highlightFirst ? "highlightFirst" : "introFirst"];
  if (variant === "longCopy") return MASTER_SLIDE_INDEX[tone].longCopy ?? order.at(-1);
  return order[variant - 1] ?? order.at(-1);
}

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
  const bytes = fs.readFileSync(path.join(rootDir, "fixtures", MASTER_TEMPLATE_FIXTURE));
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

// Quebra e corpo medidos com as larguras reais da Montserrat, na caixa que o próprio
// Slides devolve. As linhas vão explícitas: deixar o Slides quebrar sozinho era o que
// fazia a última linha vazar do painel colorido.
function fitToElement(text, widthPt, heightPt, baseSize, weight) {
  return fitTextToBox(text, { w: widthPt / 72, h: heightPt / 72 }, {
    baseSize,
    minSize: Math.max(14, baseSize * 0.62),
    weight,
    maxLines: 6,
  });
}

const MASTER_TEMPLATES = ["photo-green", "photo-blue"];

/** Slide do mestre e textos já medidos para uma capa fotográfica. */
function photoMasterTarget(plan) {
  const tone = plan.templateId === "photo-blue" ? "blue" : "green";
  const intro = normalizedText(plan.intro).toUpperCase();
  const highlight = normalizedText(plan.highlight).toUpperCase();
  const highlightFirst = plan.copyOrder === "highlight-intro";
  // Mesma medição do gerador de PPT: vence a primeira variação em que o texto cabe
  // inteiro. Este template não tem layout de copy longa — o que não couber na
  // variação 3 reduz o corpo, em vez de apontar para um slide inexistente.
  const fitted = fitPhotoMasterPanel(intro, highlight, highlightFirst, {
    highlightWeight: "bold",
    allowLongCopy: Boolean(MASTER_SLIDE_INDEX[tone].longCopy),
  });
  return { slideNumber: masterSlideNumber(tone, highlightFirst, fitted.variant), intro, highlight };
}

/**
 * Requisições que preenchem um slide do mestre com o texto e a foto do post.
 *
 * O conteúdo é lido do slide original, mas endereçado por `idFor`: quando o slide
 * é editado no lugar, `idFor` é a identidade; quando é uma cópia feita por
 * `duplicateObject`, `idFor` traduz cada id para o da cópia.
 */
export function photoFillRequests(source, idFor, target, photoUrl) {
  const requests = [];
  let photoElementId = null;
  let photoArea = 0;

  for (const element of source.pageElements || []) {
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
    const sourceText = isIntro ? target.intro : target.highlight;
    const originalStyle = shapeTextStyle(element) || {};
    const baseSize = originalStyle.fontSize?.magnitude || (isIntro ? 18 : 54);
    const { width, height } = elementSizePt(element);
    const box = sourceText
      ? fitToElement(sourceText, width, height, baseSize, isIntro ? "regular" : "bold")
      : { text: "", fontSize: baseSize };
    const objectId = idFor(element.objectId);

    // O texto do mestre tem quebras de parágrafo, então substituição por busca não
    // funciona: apagamos tudo e inserimos o novo texto reaplicando o estilo original.
    requests.push({ deleteText: { objectId, textRange: { type: "ALL" } } });
    if (box.text) {
      requests.push({ insertText: { objectId, text: box.text, insertionIndex: 0 } });
      const style = { ...originalStyle, fontSize: { magnitude: box.fontSize, unit: "PT" } };
      requests.push({
        updateTextStyle: {
          objectId,
          style,
          textRange: { type: "ALL" },
          fields: Object.keys(style).join(","),
        },
      });
    }
  }

  if (photoUrl && photoElementId) {
    requests.push({
      replaceImage: { imageObjectId: idFor(photoElementId), url: photoUrl, imageReplaceMethod: "CENTER_CROP" },
    });
  }
  return requests;
}

/**
 * Duplica um slide do mestre com ids previsíveis, para que as requisições de
 * preenchimento possam endereçar a cópia no mesmo batchUpdate que a criou.
 */
export function duplicateSlidePlan(source, prefix) {
  const objectIds = { [source.objectId]: `${prefix}slide` };
  (source.pageElements || []).forEach((element, index) => {
    objectIds[element.objectId] = `${prefix}el${index}`;
  });
  return {
    request: { duplicateObject: { objectId: source.objectId, objectIds } },
    idFor: (id) => objectIds[id] ?? id,
    slideId: objectIds[source.objectId],
  };
}

async function copyMasterPresentation(accessToken, title) {
  const templateId = await ensureMasterTemplate(accessToken);
  const copied = await googleFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${templateId}/copy?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: title }),
    timeout: 120_000,
  });
  const presentation = await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${copied.id}`, { timeout: 60_000 });
  return { presentationId: copied.id, slides: presentation.slides || [] };
}

async function batchUpdate(accessToken, presentationId, requests) {
  if (!requests.length) return;
  await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
    timeout: 180_000,
  });
}

/**
 * A Slides API ignora `pageSize` no presentations.create; a única forma de obter a
 * página 4:5 é converter um PPTX em branco 10"x12,5" pelo Drive — a conversão
 * preserva o tamanho e o arquivo vazio não carrega nenhum texto ou fonte.
 */
async function createBlankPresentation(accessToken, title) {
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
  return created.id;
}

function presentationLinks(presentationId, title) {
  return {
    designId: presentationId,
    title,
    editUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
    viewUrl: `https://docs.google.com/presentation/d/${presentationId}/preview`,
  };
}

async function deliverPhotoFromMaster(accessToken, plan, image, title, uploader) {
  const target = photoMasterTarget(plan);
  const { presentationId, slides } = await copyMasterPresentation(accessToken, title);
  const source = slides[target.slideNumber - 1];
  if (!source) throw new Error("O template mestre no Google não tem o slide esperado");

  const photoUrl = image?.base64
    ? await uploader("foto-post.jpg", Buffer.from(image.base64, "base64"), image.mimeType || "image/jpeg")
    : null;

  const requests = slides
    .filter((slide) => slide.objectId !== source.objectId)
    .map((slide) => ({ deleteObject: { objectId: slide.objectId } }));
  requests.push(...photoFillRequests(source, (id) => id, target, photoUrl));

  await batchUpdate(accessToken, presentationId, requests);
  return presentationLinks(presentationId, title);
}

/**
 * Vários posts numa apresentação só, um slide (ou um carrossel inteiro) por post,
 * na ordem em que foram selecionados.
 *
 * Parte de uma cópia do mestre porque as capas fotográficas nascem de duplicatas
 * dos slides aprovados; os demais layouts são desenhados do zero na mesma
 * apresentação. No fim os slides originais do mestre são apagados e a ordem é
 * reaplicada.
 */
/**
 * Plano de requisições do lote: o que duplicar, o que preencher, o que apagar e em
 * que ordem os slides ficam. É função pura de propósito — a ordem das requisições é
 * a parte que só a Slides API julga em produção, então precisa ser conferível aqui.
 *
 * `builtPages[i]` traz as páginas dos layouts desenhados do zero; posts de capa
 * fotográfica não têm entrada e nascem de uma duplicata do slide do mestre.
 */
export function planBatchRequests(masterSlides, entries, photoUrls, builtPages) {
  const requests = [];
  const orderedSlideIds = [];
  const posts = [];

  for (const [index, entry] of entries.entries()) {
    const { plan } = entry;
    let pageIds;

    if (MASTER_TEMPLATES.includes(plan.templateId)) {
      const target = photoMasterTarget(plan);
      const source = masterSlides[target.slideNumber - 1];
      if (!source) throw new Error("O template mestre no Google não tem o slide esperado");
      const duplicated = duplicateSlidePlan(source, `anfatre_p${index + 1}_`);
      requests.push(duplicated.request);
      requests.push(...photoFillRequests(source, duplicated.idFor, target, photoUrls[index]));
      pageIds = [duplicated.slideId];
    } else {
      const built = builtPages[index];
      if (!built) throw new Error(`As páginas do post ${index + 1} não foram montadas`);
      requests.push(...built.requests);
      pageIds = built.pageIds;
    }

    orderedSlideIds.push(...pageIds);
    posts.push({
      title: plan.jobTitle || plan.sourceTitle || plan.highlight || plan.intro,
      caption: plan.caption,
      slideCount: pageIds.length,
    });
  }

  // Os slides originais do mestre só saem depois de todas as duplicatas existirem.
  for (const slide of masterSlides) requests.push({ deleteObject: { objectId: slide.objectId } });
  if (orderedSlideIds.length > 1) {
    requests.push({ updateSlidesPosition: { slideObjectIds: orderedSlideIds, insertionIndex: 0 } });
  }

  return { requests, orderedSlideIds, posts };
}

/**
 * Vários posts numa apresentação só, um bloco de slides por post, na ordem em que
 * foram selecionados.
 *
 * Parte de uma cópia do mestre porque as capas fotográficas nascem de duplicatas dos
 * slides aprovados; os demais layouts são desenhados do zero na mesma apresentação.
 */
async function deliverBatchFromMaster(accessToken, entries, title, uploader) {
  const { presentationId, slides } = await copyMasterPresentation(accessToken, title);

  // As fotos sobem antes para que o plano de requisições seja síncrono e testável.
  const photoUrls = [];
  const builtPages = [];
  for (const [index, entry] of entries.entries()) {
    photoUrls[index] = entry.image?.base64
      ? await uploader(`foto-post-${index + 1}.jpg`, Buffer.from(entry.image.base64, "base64"), entry.image.mimeType || "image/jpeg")
      : null;
    builtPages[index] = MASTER_TEMPLATES.includes(entry.plan.templateId)
      ? null
      : await generatePlanPages(entry.plan, entry.image, uploader, `p${index + 1}_`);
  }

  const plan = planBatchRequests(slides, entries, photoUrls, builtPages);
  await batchUpdate(accessToken, presentationId, plan.requests);
  return { ...presentationLinks(presentationId, title), posts: plan.posts };
}

/**
 * Entrega um post por vez. Mantido separado do lote porque é o caminho já rodado
 * em produção: um post continua saindo exatamente como saía antes.
 */
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
    if (MASTER_TEMPLATES.includes(plan.templateId)) {
      return await deliverPhotoFromMaster(accessToken, plan, image, title, uploader);
    }

    const requests = await generateSlidesRequests(plan, image, uploader);

    const presentationId = await createBlankPresentation(accessToken, title);
    const presentation = await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=slides.objectId`, {
      timeout: 60_000,
    });
    const importedSlideIds = (presentation.slides || []).map((slide) => slide.objectId);

    await batchUpdate(accessToken, presentationId, [
      ...requests,
      ...importedSlideIds.map((objectId) => ({ deleteObject: { objectId } })),
    ]);

    return presentationLinks(presentationId, title);
  } finally {
    for (const fileId of uploaded) await deleteDriveFile(accessToken, fileId);
  }
}

/**
 * Entrega vários posts numa apresentação só, um bloco de slides por post.
 * Com um post apenas, cai no caminho de sempre.
 */
export async function deliverBatchToGoogleSlides(accessToken, entries, title) {
  if (entries.length === 1) {
    const [only] = entries;
    const delivered = await deliverToGoogleSlides(accessToken, only.plan, only.image, title);
    return {
      ...delivered,
      posts: [{
        title: only.plan.jobTitle || only.plan.highlight || only.plan.intro,
        caption: only.plan.caption,
        slideCount: Math.max(1, only.plan.slides?.length || 1),
      }],
    };
  }

  const uploaded = [];
  const uploader = async (name, buffer, mime) => {
    const file = await uploadDriveImage(accessToken, name, buffer, mime);
    uploaded.push(file.id);
    return file.url;
  };

  try {
    return await deliverBatchFromMaster(accessToken, entries, title, uploader);
  } finally {
    for (const fileId of uploaded) await deleteDriveFile(accessToken, fileId);
  }
}
