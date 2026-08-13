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
  slide.addText(String(text || ""), {
    fontFace: "Montserrat",
    color: COLORS.ink,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    valign: "mid",
    paraSpaceAfterPt: 0,
    ...options,
  });
}

function addTricolor(slide, y, h) {
  rect(slide, 0, y, 10 / 3, h, COLORS.blue);
  rect(slide, 10 / 3, y, 10 / 3, h, COLORS.green);
  rect(slide, 20 / 3, y, 10 / 3, h, COLORS.yellow);
}

function addIcons(slide, y, size = 0.62) {
  const left = 0.28;
  const usable = 9.44;
  const gap = (usable - ICONS.length * size) / (ICONS.length - 1);
  ICONS.forEach((file, index) => {
    const svg = fs
      .readFileSync(path.join(rootDir, "assets", "icons", file), "utf8")
      .replaceAll("currentColor", `#${COLORS.yellow}`);
    slide.addImage({
      data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      x: left + index * (size + gap),
      y,
      w: size,
      h: size,
      altText: `Pictograma ANFATRE ${index + 1}`,
    });
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
  addText(slide, first, {
    x: 1.52,
    y: 1.65,
    w: 6.96,
    h: 1.55,
    fontSize: firstIsHighlight ? 48 : 31.5,
    bold: firstIsHighlight,
    color: firstIsHighlight ? COLORS.yellow : COLORS.white,
    align: "center",
    valign: "bottom",
    breakLine: false,
  });
  addText(slide, second, {
    x: 1.52,
    y: 3.18,
    w: 6.96,
    h: 1.95,
    fontSize: firstIsHighlight ? 30 : 46,
    bold: !firstIsHighlight,
    color: firstIsHighlight ? COLORS.white : COLORS.yellow,
    align: "center",
    valign: "top",
    breakLine: false,
  });
}

function buildPhotoCover(slide, plan, image) {
  addPhoto(slide, { ...image, templateId: plan.templateId });
  const tone = plan.templateId === "photo-blue" ? "blue" : "green";
  addPhotoPanel(slide, tone, plan.intro, plan.highlight, plan.templateId === "photo-blue");
}

function buildQuestion(slide, plan) {
  slide.background = { color: COLORS.white };
  rect(slide, 0, 0, 10, 0.85, COLORS.blue);
  addIcons(slide, 0.11, 0.62);
  rect(slide, 0, 0.85, 10, 5.93, COLORS.green);
  slide.addImage({
    path: path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"),
    x: 5.39,
    y: 1.65,
    w: 3.89,
    h: 3.89,
    altText: "Mapa pontilhado do Brasil",
  });
  addText(slide, plan.highlight || plan.intro, {
    x: 0.81,
    y: 1.72,
    w: 4.35,
    h: 3.6,
    fontSize: 52.5,
    bold: true,
    color: COLORS.white,
    align: "left",
    valign: "mid",
  });
  rect(slide, 0, 6.78, 10, 0.09, COLORS.yellow);
  for (let index = 0; index < 3; index += 1) rect(slide, 0, 6.94 + index * 0.16, 10, 0.075, COLORS.yellow);
  addText(slide, plan.closing || plan.intro, {
    x: 0.93,
    y: 7.82,
    w: 8.14,
    h: 2.1,
    fontSize: 34,
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
  addIcons(slide, 5.28, 0.66);
  for (let index = 0; index < 3; index += 1) rect(slide, 0, 6.54 + index * 0.17, 10, 0.08, COLORS.blue);
  addText(slide, plan.intro, {
    x: 0.83,
    y: 7.55,
    w: 8.34,
    h: 0.9,
    fontSize: 35,
    color: COLORS.blue,
    align: "center",
  });
  addText(slide, plan.highlight, {
    x: 0.83,
    y: 8.42,
    w: 8.34,
    h: 1.45,
    fontSize: 45,
    bold: true,
    color: COLORS.blue,
    align: "center",
    valign: "top",
  });
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    x: 3.47,
    y: 10.35,
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
