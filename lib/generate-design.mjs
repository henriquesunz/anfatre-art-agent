import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, "..");

const COLORS = {
  green: "289942",
  blue: "1E78C2",
  yellow: "FFD036",
  ink: "2C2E35",
  white: "FFFFFF",
};

const ICONS = [
  "reboque-gaiola.svg",
  "reboque-bau.svg",
  "carretinha.svg",
  "reboque-cavalos.svg",
  "trailer-camping.svg",
  "reboque-motos.svg",
  "reboque-barcos.svg",
  "food-trailer.svg",
  "quinta-roda.svg",
  "motorhome.svg",
];

const DEFAULT_PHOTOS = {
  "photo-green": "engate-detalhe.jpg",
  "photo-blue": "motorhome-solar.jpg",
  "photo-signature": "motorhome-estrada.jpg",
};

function rect(slide, x, y, w, h, color) {
  slide.addShape("rect", { x, y, w, h, fill: { color }, line: { color, transparency: 100 } });
}

function addText(slide, text, options = {}) {
  slide.addText(String(text || "").replace(/[💬🔖]/gu, ""), {
    fontFace: "Montserrat",
    color: COLORS.ink,
    margin: 0.025,
    breakLine: false,
    valign: "mid",
    paraSpaceAfterPt: 0,
    ...options,
  });
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function balanceLines(value, maxLines, preferredChars) {
  const text = normalizedText(value);
  if (!text) return "";
  const words = text.split(" ");
  const lineCount = Math.min(maxLines, Math.max(1, Math.ceil(text.length / preferredChars)));
  if (lineCount === 1 || words.length === 1) return text;

  const lines = [];
  let cursor = 0;
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const remainingLines = lineCount - lineIndex;
    const remaining = words.slice(cursor).join(" ");
    if (remainingLines === 1) {
      lines.push(remaining);
      break;
    }
    const target = remaining.length / remainingLines;
    const line = [];
    let length = 0;
    while (cursor < words.length) {
      const word = words[cursor];
      const nextLength = length + (line.length ? 1 : 0) + word.length;
      const wordsAfter = words.length - cursor - 1;
      if (line.length && nextLength > target && wordsAfter >= remainingLines - 1) break;
      line.push(word);
      length = nextLength;
      cursor += 1;
    }
    lines.push(line.join(" "));
  }
  return lines.filter(Boolean).join("\n");
}

function fontForLines(text, baseSize, preferredChars, minSize) {
  const longest = Math.max(...String(text || "").split("\n").map((line) => line.length), 1);
  if (longest <= preferredChars) return baseSize;
  return Math.max(minSize, Math.floor(baseSize * preferredChars / longest));
}

function displayPair(plan) {
  let intro = normalizedText(plan.intro);
  let highlight = normalizedText(plan.highlight);
  const introWords = new Set(intro.toLowerCase().replace(/[^a-zá-ú0-9 ]/gi, " ").split(/\s+/).filter((word) => word.length > 3));
  const highlightWords = new Set(highlight.toLowerCase().replace(/[^a-zá-ú0-9 ]/gi, " ").split(/\s+/).filter((word) => word.length > 3));
  const shared = [...introWords].filter((word) => highlightWords.has(word)).length;
  const similarity = shared / Math.max(1, Math.min(introWords.size, highlightWords.size));

  if (similarity >= 0.6) {
    const source = normalizedText(plan.sourceTitle || plan.jobTitle).replace(/^\d{1,2}\/\d{1,2}\s*[—–-]\s*/, "");
    const colon = source.indexOf(":");
    if (colon > 3 && colon < source.length - 5) {
      intro = source.slice(0, colon);
      highlight = source.slice(colon + 1).toUpperCase();
    }
  }
  return { intro, highlight };
}

function addTricolor(slide, y, h) {
  rect(slide, 0, y, 10 / 3, h, COLORS.blue);
  rect(slide, 10 / 3, y, 10 / 3, h, COLORS.green);
  rect(slide, 20 / 3, y, 10 / 3, h, COLORS.yellow);
}

function safeSvg(file, color = null) {
  let svg = fs.readFileSync(file, "utf8");
  const viewBox = svg.match(/viewBox="([\d.\s-]+)"/i)?.[1]?.split(/\s+/).map(Number);
  if (viewBox?.length === 4) {
    const [x, y, width, height] = viewBox;
    const padX = width * 0.035;
    const padY = height * 0.055;
    svg = svg.replace(/viewBox="[^"]+"/i, `viewBox="${x - padX} ${y - padY} ${width + padX * 2} ${height + padY * 2}"`);
  }
  if (color) svg = svg.replaceAll("currentColor", `#${color}`);
  return { svg, viewBox };
}

function addIcons(slide, y, maxHeight = 0.5) {
  const icons = ICONS.map((file) => {
    const { svg, viewBox } = safeSvg(path.join(rootDir, "assets", "icons", file), COLORS.yellow);
    const ratio = viewBox?.length === 4 ? viewBox[2] / viewBox[3] : 1.5;
    return { file, svg, width: maxHeight * ratio };
  });
  const left = 0.55;
  const usable = 8.9;
  const totalWidth = icons.reduce((sum, icon) => sum + icon.width, 0);
  const scale = Math.min(1, usable / Math.max(totalWidth, 0.01));
  const height = maxHeight * scale;
  const widths = icons.map((icon) => icon.width * scale);
  const gap = Math.max(0.045, (usable - widths.reduce((sum, width) => sum + width, 0)) / (ICONS.length - 1));
  let x = left;
  icons.forEach((icon, index) => {
    slide.addImage({
      data: `data:image/svg+xml;base64,${Buffer.from(icon.svg).toString("base64")}`,
      x,
      y,
      w: widths[index],
      h: height,
      altText: `Pictograma ANFATRE ${index + 1}`,
    });
    x += widths[index] + gap;
  });
}

function addPhoto(slide, image) {
  const source = image?.base64
    ? { data: `data:${image.mimeType || "image/jpeg"};base64,${image.base64}` }
    : { path: path.join(rootDir, "assets", "photos", DEFAULT_PHOTOS[image?.templateId] || DEFAULT_PHOTOS["photo-green"]) };
  slide.addImage({ ...source, x: 0, y: 0, w: 10, h: 12.5, sizing: { type: "cover", w: 10, h: 12.5 } });
}

function addPhotoPanel(slide, tone, intro, highlight, highlightFirst = false) {
  const color = tone === "blue" ? COLORS.blue : COLORS.green;
  rect(slide, 1, 0.89, 8, 5.25, color);

  // As listras pertencem ao painel e ficam por cima do quadro colorido.
  rect(slide, 1, 0.89, 8, 0.15, COLORS.yellow);
  for (let index = 0; index < 4; index += 1) {
    rect(slide, 1, 1.09 + index * 0.12, 8, 0.055, COLORS.yellow);
  }

  const first = highlightFirst ? highlight : intro;
  const second = highlightFirst ? intro : highlight;
  const firstIsHighlight = highlightFirst;
  const firstWrapped = balanceLines(first, firstIsHighlight ? 2 : 3, firstIsHighlight ? 24 : 27);
  const secondWrapped = balanceLines(second, firstIsHighlight ? 3 : 2, firstIsHighlight ? 27 : 24);
  addText(slide, firstWrapped, {
    x: 1.45,
    y: 1.7,
    w: 7.1,
    h: 1.32,
    fontSize: fontForLines(firstWrapped, firstIsHighlight ? 38 : 27, firstIsHighlight ? 24 : 27, firstIsHighlight ? 32 : 23),
    bold: firstIsHighlight,
    color: firstIsHighlight ? COLORS.yellow : COLORS.white,
    align: "center",
    valign: "mid",
    breakLine: false,
  });
  addText(slide, secondWrapped, {
    x: 1.45,
    y: 3.16,
    w: 7.1,
    h: 1.58,
    fontSize: fontForLines(secondWrapped, firstIsHighlight ? 27 : 42, firstIsHighlight ? 27 : 24, firstIsHighlight ? 22 : 34),
    bold: !firstIsHighlight,
    color: firstIsHighlight ? COLORS.white : COLORS.yellow,
    align: "center",
    valign: "mid",
    breakLine: false,
  });
}

function buildPhotoCover(slide, plan, image) {
  addPhoto(slide, { ...image, templateId: plan.templateId });
  const tone = plan.templateId === "photo-blue" ? "blue" : "green";
  const copy = displayPair(plan);
  addPhotoPanel(slide, tone, copy.intro, copy.highlight, plan.templateId === "photo-blue");
}

function buildQuestion(slide, plan) {
  const copy = displayPair(plan);
  slide.background = { color: COLORS.white };
  rect(slide, 0, 0, 10, 0.85, COLORS.blue);
  addIcons(slide, 0.19, 0.47);
  rect(slide, 0, 0.85, 10, 5.93, COLORS.green);
  slide.addImage({
    path: path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"),
    x: 5.39,
    y: 1.65,
    w: 3.89,
    h: 3.89,
    altText: "Mapa pontilhado do Brasil",
  });
  const questionTitle = balanceLines(copy.highlight || copy.intro, 4, 18);
  addText(slide, questionTitle, {
    x: 0.72,
    y: 1.58,
    w: 4.7,
    h: 3.85,
    fontSize: fontForLines(questionTitle, 38, 18, 32),
    bold: true,
    color: COLORS.white,
    align: "left",
    valign: "mid",
  });
  rect(slide, 0, 6.78, 10, 0.09, COLORS.yellow);
  for (let index = 0; index < 3; index += 1) rect(slide, 0, 6.94 + index * 0.16, 10, 0.075, COLORS.yellow);
  const questionClosing = balanceLines(plan.closing || copy.intro, 3, 34);
  addText(slide, questionClosing, {
    x: 0.93,
    y: 7.82,
    w: 8.14,
    h: 2.1,
    fontSize: fontForLines(questionClosing, 30, 34, 24),
    color: COLORS.blue,
    align: "center",
  });
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    x: 3.47,
    y: 10.27,
    w: 3.06,
    h: 1.3,
    altText: "ANFATRE RV",
  });
  addTricolor(slide, 12.37, 0.13);
}

function buildInstitutional(slide, plan) {
  const copy = displayPair(plan);
  slide.background = { color: COLORS.white };
  addTricolor(slide, 0, 0.15);
  rect(slide, 0, 0.15, 10, 6.39, COLORS.blue);
  slide.addImage({
    path: path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"),
    x: 2.82,
    y: 0.56,
    w: 4.36,
    h: 4.36,
    altText: "Mapa pontilhado do Brasil",
  });
  addIcons(slide, 5.4, 0.48);
  for (let index = 0; index < 3; index += 1) rect(slide, 0, 6.54 + index * 0.17, 10, 0.08, COLORS.blue);
  const institutionalIntro = balanceLines(copy.intro, 2, 32);
  addText(slide, institutionalIntro, {
    x: 0.83,
    y: 7.4,
    w: 8.34,
    h: 0.78,
    fontSize: fontForLines(institutionalIntro, 28, 32, 24),
    color: COLORS.blue,
    align: "center",
  });
  const institutionalHighlight = balanceLines(copy.highlight, 2, 25);
  addText(slide, institutionalHighlight, {
    x: 0.83,
    y: 8.27,
    w: 8.34,
    h: 1.5,
    fontSize: fontForLines(institutionalHighlight, 37, 25, 31),
    bold: true,
    color: COLORS.blue,
    align: "center",
    valign: "top",
  });
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    x: 3.47,
    y: 10.55,
    w: 3.06,
    h: 1.3,
    altText: "ANFATRE RV",
  });
  addTricolor(slide, 12.35, 0.15);
}

function buildCarousel(slide, plan) {
  slide.background = { color: COLORS.white };
  addTricolor(slide, 0, 0.13);
  slide.addImage({
    path: path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"),
    x: 0.28,
    y: 0.37,
    w: 2.69,
    h: 2.69,
    transparency: 82,
    altText: "Mapa decorativo do Brasil",
  });
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    x: 2.04,
    y: 1.94,
    w: 5.92,
    h: 2.5,
    altText: "ANFATRE RV",
  });
  rect(slide, 0, 6.22, 10, 6.28, COLORS.blue);
  addText(slide, plan.intro, {
    x: 0.65,
    y: 7.78,
    w: 8.7,
    h: 1.6,
    fontSize: 35,
    color: COLORS.white,
    align: "center",
  });
  addText(slide, plan.highlight, {
    x: 0.65,
    y: 9.3,
    w: 8.7,
    h: 1.05,
    fontSize: 43,
    bold: true,
    color: COLORS.yellow,
    align: "center",
  });
  addIcons(slide, 11.42, 0.64);
  addTricolor(slide, 12.37, 0.13);
}

function isClosingSlide(data) {
  return /comente|salve|compartilhe|próxima parada|acesse|saiba mais/i.test(`${data.title} ${data.body}`);
}

function addCarouselPageNumber(slide, index, total, color = COLORS.blue) {
  addText(slide, `${index}/${total}`, {
    x: 8.6,
    y: 0.42,
    w: 0.75,
    h: 0.34,
    fontSize: 13,
    bold: true,
    color,
    align: "right",
  });
}

function buildCarouselContent(slide, data, index, total) {
  slide.background = { color: COLORS.white };
  addTricolor(slide, 0, 0.13);
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    x: 0.55,
    y: 0.35,
    w: 2.15,
    h: 0.91,
    altText: "ANFATRE RV",
  });
  addCarouselPageNumber(slide, index, total);

  rect(slide, 0, 1.52, 10, 2.65, COLORS.green);
  slide.addImage({
    path: path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"),
    x: 6.95,
    y: 1.73,
    w: 2.15,
    h: 2.15,
    transparency: 36,
    altText: "Mapa decorativo do Brasil",
  });
  addText(slide, data.title, {
    x: 0.68,
    y: 1.88,
    w: 6.35,
    h: 1.75,
    fontSize: 38,
    bold: true,
    color: COLORS.white,
    valign: "mid",
  });
  addText(slide, data.body || data.title, {
    x: 0.75,
    y: 4.75,
    w: 8.5,
    h: 6.15,
    fontSize: 21,
    color: COLORS.ink,
    valign: "top",
    breakLine: true,
    lineSpacingMultiple: 1.08,
    fit: "shrink",
  });
  rect(slide, 0, 11.22, 10, 1.15, COLORS.blue);
  addIcons(slide, 11.43, 0.61);
  addTricolor(slide, 12.37, 0.13);
}

function buildCarouselClosing(slide, data, index, total) {
  slide.background = { color: COLORS.blue };
  addTricolor(slide, 0, 0.13);
  slide.addImage({
    path: path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"),
    x: 5.9,
    y: 0.72,
    w: 3.25,
    h: 3.25,
    transparency: 35,
    altText: "Mapa decorativo do Brasil",
  });
  addCarouselPageNumber(slide, index, total, COLORS.white);
  rect(slide, 0.5, 0.38, 2.82, 1.36, COLORS.white);
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    x: 0.68,
    y: 0.56,
    w: 2.4,
    h: 1.02,
    altText: "ANFATRE RV",
  });
  addText(slide, data.title, {
    x: 0.82,
    y: 3.25,
    w: 8.36,
    h: 2.25,
    fontSize: 43,
    bold: true,
    color: COLORS.white,
    align: "center",
  });
  addText(slide, data.body, {
    x: 1.02,
    y: 6,
    w: 7.96,
    h: 3.5,
    fontSize: 24,
    color: COLORS.yellow,
    align: "center",
    valign: "top",
    breakLine: true,
    lineSpacingMultiple: 1.08,
    fit: "shrink",
  });
  addIcons(slide, 11.35, 0.64);
  addTricolor(slide, 12.37, 0.13);
}

export const TEMPLATE_OPTIONS = [
  { id: "auto", label: "O agente escolhe" },
  { id: "photo-green", label: "Capa fotográfica — verde", needsPhoto: true },
  { id: "photo-blue", label: "Capa fotográfica — azul", needsPhoto: true },
  { id: "photo-signature", label: "Capa fotográfica — assinatura", needsPhoto: true },
  { id: "question", label: "Conteúdo — pergunta", needsPhoto: false },
  { id: "institutional", label: "Institucional — final", needsPhoto: false },
  { id: "carousel", label: "Carrossel — capa", needsPhoto: false },
];

export function templateNeedsPhoto(templateId) {
  return TEMPLATE_OPTIONS.find((item) => item.id === templateId)?.needsPhoto === true;
}

export async function generateDesignPptx(plan, image = null) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "ANFATRE_4X5", width: 10, height: 12.5 });
  pptx.layout = "ANFATRE_4X5";
  pptx.author = "ANFATRE Art Agent";
  pptx.company = "Sunz Digital";
  pptx.subject = "Post editável ANFATRE RV";
  pptx.title = `ANFATRE — ${plan.jobTitle || plan.highlight}`;
  pptx.lang = "pt-BR";
  pptx.theme = { headFontFace: "Montserrat", bodyFontFace: "Montserrat", lang: "pt-BR" };

  if (plan.templateId === "carousel" && Array.isArray(plan.slides) && plan.slides.length > 1) {
    const cover = pptx.addSlide();
    buildCarousel(cover, plan);
    const total = plan.slides.length;
    plan.slides.slice(1).forEach((data, offset) => {
      const slide = pptx.addSlide();
      const index = offset + 2;
      if (isClosingSlide(data)) buildCarouselClosing(slide, data, index, total);
      else buildCarouselContent(slide, data, index, total);
    });
    return Buffer.from(await pptx.write({ outputType: "nodebuffer", compression: true }));
  }

  const slide = pptx.addSlide();
  if (["photo-green", "photo-blue", "photo-signature"].includes(plan.templateId)) {
    buildPhotoCover(slide, plan, image);
  } else if (plan.templateId === "question") {
    buildQuestion(slide, plan);
  } else if (plan.templateId === "institutional") {
    buildInstitutional(slide, plan);
  } else {
    buildCarousel(slide, plan);
  }

  return Buffer.from(await pptx.write({ outputType: "nodebuffer", compression: true }));
}
