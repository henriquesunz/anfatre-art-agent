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

// Medidas transcritas do arquivo ppt-mestre.pptx (slide 960 x 1200 px).
// O restante do design system continua usando os tokens antigos acima.
const PHOTO_MASTER = {
  colors: {
    green: "289942",
    blue: "2778C2",
    yellow: "FBD037",
    white: "FFFFFF",
  },
  panel: {
    short: [94.48, 92.87, 771.05, 396.57],
    tall: [94.48, 92.87, 771.05, 469.46],
  },
  stripes: [
    [94.48, 92.87, 771.61, 11.64],
    [94.48, 113.02, 771.61, 6.8],
    [94.48, 128.63, 771.61, 4.8],
    [94.48, 146.63, 771.61, 4.8],
    [94.48, 162.77, 771.59, 3.02],
  ],
  introFirst: {
    1: {
      intro: [187.28, 204.84, 580.72, 48.39],
      highlight: [189.64, 255.07, 580.72, 184.18],
    },
    2: {
      intro: [187.28, 183.03, 580.72, 92.02],
      highlight: [189.64, 278.55, 580.72, 184.18],
    },
    3: {
      intro: [187.28, 193.48, 580.72, 135.64],
      highlight: [215.02, 332.72, 525.25, 203.57],
    },
  },
  highlightFirst: {
    1: {
      intro: [187.28, 379.09, 580.72, 48.39],
      highlight: [189.64, 189.33, 580.72, 184.18],
    },
    2: {
      intro: [187.28, 365.42, 580.72, 92.02],
      highlight: [189.64, 181.91, 580.72, 184.18],
    },
    3: {
      intro: [187.28, 387.2, 580.72, 135.64],
      highlight: [215.02, 193.56, 525.25, 203.57],
    },
  },
  signature: {
    whitePanel: [0, 0, 960, 616.19],
    logo: [222.61, 73.15, 514.77, 261.68],
    title: [179.98, 334.82, 600.04, 203.57],
    topBands: [
      [0, 0, 324.49, 20.77],
      [317.75, 0, 324.49, 20.77],
      [635.51, 0, 324.49, 20.77],
    ],
    bottomBands: [
      [0, 1179.23, 324.49, 20.77],
      [317.75, 1179.23, 324.49, 20.77],
      [635.51, 1179.23, 324.49, 20.77],
    ],
  },
};

function masterBox([x, y, w, h]) {
  return { x: x / 96, y: y / 96, w: w / 96, h: h / 96 };
}

function rect(slide, x, y, w, h, color) {
  slide.addShape("rect", { x, y, w, h, fill: { color }, line: { color, transparency: 100 } });
}

function addText(slide, text, options = {}) {
  slide.addText(String(text || ""), {
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
  const computed = Math.floor(baseSize * preferredChars / longest);
  // safeMin: não força tamanho maior do que o que cabe — o Canva não faz shrink automático.
  const safeMin = Math.min(minSize, computed);
  return Math.max(safeMin, computed);
}

function displayPair(plan) {
  return {
    intro: normalizedText(plan.intro),
    highlight: normalizedText(plan.highlight),
  };
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

function masterLineCount(value, preferredChars, maxLines = 3) {
  const text = normalizedText(value);
  if (!text) return 0;
  if (text.split(" ").length === 1) return 1;
  return Math.min(maxLines, Math.max(1, Math.ceil(text.length / preferredChars)));
}

function balanceMasterLines(value, maxLines, preferredChars) {
  const text = normalizedText(value);
  if (!text) return "";
  const words = text.split(" ");
  const lineCount = Math.min(words.length, masterLineCount(text, preferredChars, maxLines));
  if (lineCount <= 1) return text;

  const target = text.length / lineCount;
  let best = null;
  function visit(start, linesLeft, lines) {
    if (linesLeft === 1) {
      const candidate = [...lines, words.slice(start).join(" ")];
      const score = candidate.reduce((sum, line) => sum + ((line.length - target) ** 2), 0);
      if (!best || score < best.score) best = { score, lines: candidate };
      return;
    }
    const lastEnd = words.length - linesLeft + 1;
    for (let end = start + 1; end <= lastEnd; end += 1) {
      visit(end, linesLeft - 1, [...lines, words.slice(start, end).join(" ")]);
    }
  }
  visit(0, lineCount, []);
  return best.lines.join("\n");
}

function masterFontSize(text, box, baseSize, minSize, lineHeightFactor) {
  const lines = String(text || "").split("\n").filter(Boolean);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const usableWidth = Math.max(0.1, box.w - 0.2);
  const usableHeight = Math.max(0.1, box.h - 0.1);
  // 0,65 é conservador de propósito: o Canva não executa o normAutofit do PowerPoint.
  // Fator reduzido de 0,78 para 0,65 para compensar a ausência do shrink no Canva.
  const horizontal = usableWidth * 72 / (longest * 0.65);
  const effectiveLineHeight = lines.length <= 1 ? 1 : lineHeightFactor;
  const vertical = usableHeight * 72 / (Math.max(lines.length, 1) * effectiveLineHeight);
  // minSize nunca pode ultrapassar o limite horizontal — o Canva não encolhe texto.
  const safeMin = Math.min(minSize, Math.floor(horizontal));
  return Math.max(safeMin, Math.min(baseSize, Math.floor(horizontal), Math.floor(vertical)));
}

function addPhotoMasterPanel(slide, tone, intro, highlight, highlightFirst = false) {
  const introLines = masterLineCount(intro, 35);
  const highlightLines = masterLineCount(highlight, 17);
  const variant = introLines >= 3 || highlightLines >= 3 ? 3 : introLines >= 2 ? 2 : 1;
  const panel = masterBox(variant === 3 ? PHOTO_MASTER.panel.tall : PHOTO_MASTER.panel.short);
  const color = tone === "blue" ? PHOTO_MASTER.colors.blue : PHOTO_MASTER.colors.green;
  rect(slide, panel.x, panel.y, panel.w, panel.h, color);
  PHOTO_MASTER.stripes.forEach((stripe) => {
    const box = masterBox(stripe);
    rect(slide, box.x, box.y, box.w, box.h, PHOTO_MASTER.colors.yellow);
  });

  const layout = (highlightFirst ? PHOTO_MASTER.highlightFirst : PHOTO_MASTER.introFirst)[variant];
  // O PPT mestre usa caixa alta em todo o texto dos painéis fotográficos.
  const introText = balanceMasterLines(intro.toUpperCase(), Math.max(1, introLines), 35);
  const highlightText = balanceMasterLines(highlight.toUpperCase(), Math.max(1, highlightLines), 17);
  const introBox = masterBox(layout.intro);
  const highlightBox = masterBox(layout.highlight);

  if (introText) {
    addText(slide, introText, {
      ...introBox,
      fontSize: masterFontSize(introText, introBox, 24, 18, 1.5),
      color: PHOTO_MASTER.colors.white,
      align: "center",
      valign: "mid",
      breakLine: true,
      lineSpacingMultiple: 1.5,
      margin: [7.2, 7.2, 3.6, 3.6],
      fit: "shrink",
    });
  }
  if (highlightText) {
    addText(slide, highlightText, {
      ...highlightBox,
      fontSize: masterFontSize(highlightText, highlightBox, variant === 3 ? 53.33 : 72, 32, 1.25),
      // ExtraBold (800) — peso visual das refs; "bold: true" gera apenas 700.
      fontFace: "Montserrat ExtraBold",
      bold: true,
      color: PHOTO_MASTER.colors.yellow,
      align: "center",
      valign: "mid",
      breakLine: true,
      margin: [7.2, 7.2, 3.6, 3.6],
      fit: "shrink",
    });
  }
}

function addSignatureBands(slide, boxes) {
  const colors = [PHOTO_MASTER.colors.blue, PHOTO_MASTER.colors.green, PHOTO_MASTER.colors.yellow];
  boxes.forEach((band, index) => {
    const box = masterBox(band);
    rect(slide, box.x, box.y, box.w, box.h, colors[index]);
  });
}

function buildPhotoSignature(slide, plan, image) {
  addPhoto(slide, { ...image, templateId: plan.templateId });
  const whitePanel = masterBox(PHOTO_MASTER.signature.whitePanel);
  rect(slide, whitePanel.x, whitePanel.y, whitePanel.w, whitePanel.h, PHOTO_MASTER.colors.white);
  addSignatureBands(slide, PHOTO_MASTER.signature.topBands);

  const logo = masterBox(PHOTO_MASTER.signature.logo);
  slide.addImage({
    path: path.join(rootDir, "assets", "logo", "anfatre-rv-full.svg"),
    ...logo,
    altText: "ANFATRE RV",
  });
  const copy = displayPair(plan);
  const title = balanceMasterLines([copy.intro, copy.highlight].filter(Boolean).join(" ").toUpperCase(), 3, 22);
  const titleBox = masterBox(PHOTO_MASTER.signature.title);
  addText(slide, title, {
    ...titleBox,
    fontSize: masterFontSize(title, titleBox, 53.33, 32, 1.25),
    fontFace: "Montserrat ExtraBold",
    bold: true,
    color: PHOTO_MASTER.colors.green,
    align: "center",
    valign: "mid",
    breakLine: true,
    margin: [7.2, 7.2, 3.6, 3.6],
    fit: "shrink",
  });
  addSignatureBands(slide, PHOTO_MASTER.signature.bottomBands);
}

function buildPhotoCover(slide, plan, image) {
  if (plan.templateId === "photo-signature") {
    buildPhotoSignature(slide, plan, image);
    return;
  }
  addPhoto(slide, { ...image, templateId: plan.templateId });
  const tone = plan.templateId === "photo-blue" ? "blue" : "green";
  const copy = displayPair(plan);
  addPhotoMasterPanel(slide, tone, copy.intro, copy.highlight, plan.copyOrder === "highlight-intro");
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
    fontFace: "Montserrat ExtraBold",
    bold: true,
    color: COLORS.white,
    align: "left",
    valign: "mid",
    fit: "shrink",
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
    fit: "shrink",
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
  if (!copy.highlight) {
    const institutionalTitle = balanceLines(copy.intro, 3, 27);
    addText(slide, institutionalTitle, {
      x: 0.83,
      y: 7.42,
      w: 8.34,
      h: 2.35,
      fontSize: fontForLines(institutionalTitle, 38, 27, 28),
      bold: true,
      color: COLORS.blue,
      align: "center",
      fit: "shrink",
    });
  } else {
    const institutionalIntro = balanceLines(copy.intro, 2, 32);
    addText(slide, institutionalIntro, {
      x: 0.83,
      y: 7.4,
      w: 8.34,
      h: 0.78,
      fontSize: fontForLines(institutionalIntro, 28, 32, 24),
      color: COLORS.blue,
      align: "center",
      fit: "shrink",
    });
    const institutionalHighlight = balanceLines(copy.highlight, 3, 25);
    addText(slide, institutionalHighlight, {
      x: 0.83,
      y: 8.27,
      w: 8.34,
      h: 1.7,
      fontSize: fontForLines(institutionalHighlight, 37, 25, 28),
      fontFace: "Montserrat ExtraBold",
      bold: true,
      color: COLORS.blue,
      align: "center",
      valign: "top",
      fit: "shrink",
    });
  }
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
  const copy = displayPair(plan);
  if (!copy.highlight) {
    const carouselTitle = balanceLines(copy.intro, 4, 27);
    addText(slide, carouselTitle, {
      x: 0.65,
      y: 7.62,
      w: 8.7,
      h: 3.25,
      fontSize: fontForLines(carouselTitle, 43, 27, 29),
      bold: true,
      color: COLORS.yellow,
      align: "center",
      fit: "shrink",
    });
  } else {
    const carouselTitle = balanceLines(copy.intro, 2, 31);
    const carouselSubtitle = balanceLines(copy.highlight, 3, 26);
    addText(slide, carouselTitle, {
      x: 0.65,
      y: 7.56,
      w: 8.7,
      h: 1.42,
      fontSize: fontForLines(carouselTitle, 34, 31, 26),
      color: COLORS.white,
      align: "center",
      fit: "shrink",
    });
    addText(slide, carouselSubtitle, {
      x: 0.65,
      y: 9.08,
      w: 8.7,
      h: 1.85,
      fontSize: fontForLines(carouselSubtitle, 42, 26, 29),
      bold: true,
      color: COLORS.yellow,
      align: "center",
      fit: "shrink",
    });
  }
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
