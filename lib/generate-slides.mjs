import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLORS,
  DEFAULT_PHOTOS,
  ICONS,
  PHOTO_MASTER,
  balanceLines,
  balanceMasterLines,
  displayPair,
  fontForLines,
  isClosingSlide,
  masterBox,
  masterFontSize,
  masterLineCount,
  normalizedText,
} from "./generate-design.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// O Slides renderiza sem shrink automático e a Montserrat ExtraBold em caixa alta é
// bem mais larga que o fator 0,65 calibrado para o Canva — medimos direto no Slides.
const EM_EXTRA_BOLD = 0.85;
const EM_REGULAR = 0.72;

function slidesMasterFontSize(text, box, baseSize, minSize, lineHeightFactor, extraBold) {
  return masterFontSize(text, box, baseSize, minSize, lineHeightFactor, extraBold ? EM_EXTRA_BOLD : EM_REGULAR);
}

function slidesFontForLines(text, baseSize, preferredChars, minSize, extraBold) {
  // Reduz o "orçamento" de caracteres por linha na mesma proporção do alargamento da fonte.
  const adjusted = Math.max(6, Math.round(preferredChars * 0.65 / (extraBold ? EM_EXTRA_BOLD : EM_REGULAR)));
  return fontForLines(text, baseSize, adjusted, minSize);
}
const rootDir = path.resolve(moduleDir, "..");

// Página 4:5 idêntica ao PPTX: 10" x 12,5" = 720 x 900 pt.
export const PAGE = { width: 720, height: 900 };

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  return {
    red: parseInt(clean.slice(0, 2), 16) / 255,
    green: parseInt(clean.slice(2, 4), 16) / 255,
    blue: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

export function imageDimensions(buffer) {
  return pngSize(buffer) || jpegSize(buffer) || null;
}

class SlidesBuilder {
  constructor(uploader) {
    this.uploader = uploader;
    this.requests = [];
    this.counter = 0;
    this.assetUrls = new Map();
  }

  id(prefix) {
    this.counter += 1;
    return `anfatre_${prefix}_${this.counter}`;
  }

  async assetUrl(filePath) {
    if (!this.assetUrls.has(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const mime = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
      const url = await this.uploader(path.basename(filePath), buffer, mime);
      this.assetUrls.set(filePath, url);
    }
    return this.assetUrls.get(filePath);
  }

  page() {
    const pageId = this.id("page");
    this.requests.push({ createSlide: { objectId: pageId, slideLayoutReference: { predefinedLayout: "BLANK" } } });
    return pageId;
  }

  background(pageId, colorHex) {
    this.requests.push({
      updatePageProperties: {
        objectId: pageId,
        pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(colorHex) } } } },
        fields: "pageBackgroundFill.solidFill.color",
      },
    });
  }

  element(pageId, x, y, w, h) {
    // Coordenadas em polegadas (mesmo sistema do PPTX) convertidas para PT.
    return {
      pageObjectId: pageId,
      size: {
        width: { magnitude: Math.max(w, 0.01) * 72, unit: "PT" },
        height: { magnitude: Math.max(h, 0.01) * 72, unit: "PT" },
      },
      transform: { scaleX: 1, scaleY: 1, translateX: x * 72, translateY: y * 72, unit: "PT" },
    };
  }

  rect(pageId, x, y, w, h, colorHex) {
    const objectId = this.id("rect");
    this.requests.push({ createShape: { objectId, shapeType: "RECTANGLE", elementProperties: this.element(pageId, x, y, w, h) } });
    this.requests.push({
      updateShapeProperties: {
        objectId,
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(colorHex) } } },
          outline: { propertyState: "NOT_RENDERED" },
        },
        fields: "shapeBackgroundFill.solidFill.color,outline.propertyState",
      },
    });
    return objectId;
  }

  async image(pageId, filePathOrUrl, x, y, w, h) {
    const url = filePathOrUrl.startsWith("http") ? filePathOrUrl : await this.assetUrl(filePathOrUrl);
    const objectId = this.id("img");
    this.requests.push({ createImage: { objectId, url, elementProperties: this.element(pageId, x, y, w, h) } });
    return objectId;
  }

  async coverImage(pageId, filePathOrBuffer, mime = "image/jpeg") {
    // Reproduz o sizing "cover" do PPTX: escala para preencher a página e centraliza.
    let buffer;
    let url;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      buffer = filePathOrBuffer;
      url = await this.uploader("foto-post.jpg", buffer, mime);
    } else {
      buffer = fs.readFileSync(filePathOrBuffer);
      url = await this.assetUrl(filePathOrBuffer);
    }
    const dims = imageDimensions(buffer) || { width: 1024, height: 1536 };
    const scale = Math.max(10 / dims.width, 12.5 / dims.height);
    const w = dims.width * scale;
    const h = dims.height * scale;
    const objectId = this.id("img");
    this.requests.push({
      createImage: { objectId, url, elementProperties: this.element(pageId, (10 - w) / 2, (12.5 - h) / 2, w, h) },
    });
    return objectId;
  }

  text(pageId, value, box, style = {}) {
    const content = String(value || "");
    if (!content.trim()) return null;
    const objectId = this.id("text");
    this.requests.push({ createShape: { objectId, shapeType: "TEXT_BOX", elementProperties: this.element(pageId, box.x, box.y, box.w, box.h) } });
    this.requests.push({
      updateShapeProperties: {
        objectId,
        shapeProperties: { contentAlignment: style.valign === "top" ? "TOP" : "MIDDLE" },
        fields: "contentAlignment",
      },
    });
    this.requests.push({ insertText: { objectId, text: content } });
    const textStyle = {
      fontFamily: "Montserrat",
      fontSize: { magnitude: style.fontSize || 18, unit: "PT" },
      foregroundColor: { opaqueColor: { rgbColor: hexToRgb(style.color || COLORS.ink) } },
      bold: Boolean(style.bold || style.extraBold),
    };
    // weightedFontFamily controla o peso exato: 800 = ExtraBold, igual às refs.
    if (style.extraBold) textStyle.weightedFontFamily = { fontFamily: "Montserrat", weight: 800 };
    this.requests.push({
      updateTextStyle: {
        objectId,
        style: textStyle,
        textRange: { type: "ALL" },
        fields: "fontFamily,fontSize,foregroundColor,bold" + (style.extraBold ? ",weightedFontFamily" : ""),
      },
    });
    const paragraphStyle = { alignment: style.align === "left" ? "START" : "CENTER" };
    let paragraphFields = "alignment";
    if (style.lineSpacing) {
      paragraphStyle.lineSpacing = style.lineSpacing;
      paragraphFields += ",lineSpacing";
    }
    this.requests.push({ updateParagraphStyle: { objectId, style: paragraphStyle, textRange: { type: "ALL" }, fields: paragraphFields } });
    return objectId;
  }

  tricolor(pageId, y, h) {
    this.rect(pageId, 0, y, 10 / 3, h, COLORS.blue);
    this.rect(pageId, 10 / 3, y, 10 / 3, h, COLORS.green);
    this.rect(pageId, 20 / 3, y, 10 / 3, h, COLORS.yellow);
  }

  async icons(pageId, y, maxHeight = 0.5) {
    const items = ICONS.map((file) => {
      const pngPath = path.join(rootDir, "assets", "icons-png", file.replace(".svg", ".png"));
      const dims = imageDimensions(fs.readFileSync(pngPath)) || { width: 3, height: 2 };
      return { pngPath, width: maxHeight * (dims.width / dims.height) };
    });
    const left = 0.55;
    const usable = 8.9;
    const totalWidth = items.reduce((sum, item) => sum + item.width, 0);
    const scale = Math.min(1, usable / Math.max(totalWidth, 0.01));
    const height = maxHeight * scale;
    const widths = items.map((item) => item.width * scale);
    const gap = Math.max(0.045, (usable - widths.reduce((sum, w) => sum + w, 0)) / (ICONS.length - 1));
    let x = left;
    for (let index = 0; index < items.length; index += 1) {
      await this.image(pageId, items[index].pngPath, x, y, widths[index], height);
      x += widths[index] + gap;
    }
  }

  logo(pageId, x, y, w, h) {
    return this.image(pageId, path.join(rootDir, "assets", "logo", "anfatre-rv-full.png"), x, y, w, h);
  }
}

async function addPhoto(builder, pageId, plan, image) {
  if (image?.base64) {
    await builder.coverImage(pageId, Buffer.from(image.base64, "base64"), image.mimeType || "image/jpeg");
  } else {
    await builder.coverImage(pageId, path.join(rootDir, "assets", "photos", DEFAULT_PHOTOS[plan.templateId] || DEFAULT_PHOTOS["photo-green"]));
  }
}

function addPhotoMasterPanel(builder, pageId, tone, intro, highlight, highlightFirst) {
  const introLines = masterLineCount(intro, 35);
  const highlightLines = masterLineCount(highlight, 17);
  const variant = introLines >= 3 || highlightLines >= 3 ? 3 : introLines >= 2 ? 2 : 1;
  const panel = masterBox(variant === 3 ? PHOTO_MASTER.panel.tall : PHOTO_MASTER.panel.short);
  const color = tone === "blue" ? PHOTO_MASTER.colors.blue : PHOTO_MASTER.colors.green;
  builder.rect(pageId, panel.x, panel.y, panel.w, panel.h, color);
  PHOTO_MASTER.stripes.forEach((stripe) => {
    const box = masterBox(stripe);
    builder.rect(pageId, box.x, box.y, box.w, box.h, PHOTO_MASTER.colors.yellow);
  });

  const layout = (highlightFirst ? PHOTO_MASTER.highlightFirst : PHOTO_MASTER.introFirst)[variant];
  const introText = balanceMasterLines(intro.toUpperCase(), Math.max(1, introLines), 35);
  const highlightText = balanceMasterLines(highlight.toUpperCase(), Math.max(1, highlightLines), 17);
  const introBox = masterBox(layout.intro);
  const highlightBox = masterBox(layout.highlight);

  if (introText) {
    builder.text(pageId, introText, introBox, {
      fontSize: slidesMasterFontSize(introText, introBox, 24, 18, 1.5, false),
      color: PHOTO_MASTER.colors.white,
      lineSpacing: 150,
    });
  }
  if (highlightText) {
    builder.text(pageId, highlightText, highlightBox, {
      fontSize: slidesMasterFontSize(highlightText, highlightBox, variant === 3 ? 53.33 : 72, 32, 1.25, true),
      color: PHOTO_MASTER.colors.yellow,
      extraBold: true,
    });
  }
}

async function buildPhotoSignature(builder, pageId, plan, image) {
  await addPhoto(builder, pageId, plan, image);
  const whitePanel = masterBox(PHOTO_MASTER.signature.whitePanel);
  builder.rect(pageId, whitePanel.x, whitePanel.y, whitePanel.w, whitePanel.h, PHOTO_MASTER.colors.white);
  const bandColors = [PHOTO_MASTER.colors.blue, PHOTO_MASTER.colors.green, PHOTO_MASTER.colors.yellow];
  PHOTO_MASTER.signature.topBands.forEach((band, index) => {
    const box = masterBox(band);
    builder.rect(pageId, box.x, box.y, box.w, box.h, bandColors[index]);
  });
  const logo = masterBox(PHOTO_MASTER.signature.logo);
  await builder.logo(pageId, logo.x, logo.y, logo.w, logo.h);
  const copy = displayPair(plan);
  const title = balanceMasterLines([copy.intro, copy.highlight].filter(Boolean).join(" ").toUpperCase(), 3, 22);
  const titleBox = masterBox(PHOTO_MASTER.signature.title);
  builder.text(pageId, title, titleBox, {
    fontSize: slidesMasterFontSize(title, titleBox, 53.33, 32, 1.25, true),
    color: PHOTO_MASTER.colors.green,
    extraBold: true,
  });
  PHOTO_MASTER.signature.bottomBands.forEach((band, index) => {
    const box = masterBox(band);
    builder.rect(pageId, box.x, box.y, box.w, box.h, bandColors[index]);
  });
}

async function buildPhotoCover(builder, pageId, plan, image) {
  if (plan.templateId === "photo-signature") {
    await buildPhotoSignature(builder, pageId, plan, image);
    return;
  }
  await addPhoto(builder, pageId, plan, image);
  const tone = plan.templateId === "photo-blue" ? "blue" : "green";
  const copy = displayPair(plan);
  addPhotoMasterPanel(builder, pageId, tone, copy.intro, copy.highlight, plan.copyOrder === "highlight-intro");
}

async function buildQuestion(builder, pageId, plan) {
  const copy = displayPair(plan);
  builder.background(pageId, COLORS.white);
  builder.rect(pageId, 0, 0, 10, 0.85, COLORS.blue);
  await builder.icons(pageId, 0.19, 0.47);
  builder.rect(pageId, 0, 0.85, 10, 5.93, COLORS.green);
  await builder.image(pageId, path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"), 5.39, 1.65, 3.89, 3.89);
  const questionTitle = balanceLines(copy.highlight || copy.intro, 4, 18);
  builder.text(pageId, questionTitle, { x: 0.72, y: 1.58, w: 4.7, h: 3.85 }, {
    fontSize: slidesFontForLines(questionTitle, 38, 18, 32, true),
    color: COLORS.white,
    align: "left",
    extraBold: true,
  });
  builder.rect(pageId, 0, 6.78, 10, 0.09, COLORS.yellow);
  for (let index = 0; index < 3; index += 1) builder.rect(pageId, 0, 6.94 + index * 0.16, 10, 0.075, COLORS.yellow);
  const questionClosing = balanceLines(plan.closing || copy.intro, 3, 34);
  builder.text(pageId, questionClosing, { x: 0.93, y: 7.82, w: 8.14, h: 2.1 }, {
    fontSize: slidesFontForLines(questionClosing, 30, 34, 24, false),
    color: COLORS.blue,
  });
  await builder.logo(pageId, 3.47, 10.27, 3.06, 1.3);
  builder.tricolor(pageId, 12.37, 0.13);
}

async function buildInstitutional(builder, pageId, plan) {
  const copy = displayPair(plan);
  builder.background(pageId, COLORS.white);
  builder.tricolor(pageId, 0, 0.15);
  builder.rect(pageId, 0, 0.15, 10, 6.39, COLORS.blue);
  await builder.image(pageId, path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"), 2.82, 0.56, 4.36, 4.36);
  await builder.icons(pageId, 5.4, 0.48);
  for (let index = 0; index < 3; index += 1) builder.rect(pageId, 0, 6.54 + index * 0.17, 10, 0.08, COLORS.blue);
  if (!copy.highlight) {
    const institutionalTitle = balanceLines(copy.intro, 3, 27);
    builder.text(pageId, institutionalTitle, { x: 0.83, y: 7.42, w: 8.34, h: 2.35 }, {
      fontSize: slidesFontForLines(institutionalTitle, 38, 27, 28, true),
      bold: true,
      color: COLORS.blue,
    });
  } else {
    const institutionalIntro = balanceLines(copy.intro, 2, 32);
    builder.text(pageId, institutionalIntro, { x: 0.83, y: 7.4, w: 8.34, h: 0.78 }, {
      fontSize: slidesFontForLines(institutionalIntro, 28, 32, 24, false),
      color: COLORS.blue,
    });
    const institutionalHighlight = balanceLines(copy.highlight, 3, 25);
    builder.text(pageId, institutionalHighlight, { x: 0.83, y: 8.27, w: 8.34, h: 1.7 }, {
      fontSize: slidesFontForLines(institutionalHighlight, 37, 25, 28, true),
      color: COLORS.blue,
      valign: "top",
      extraBold: true,
    });
  }
  await builder.logo(pageId, 3.47, 10.55, 3.06, 1.3);
  builder.tricolor(pageId, 12.35, 0.15);
}

async function buildCarouselCover(builder, pageId, plan) {
  builder.background(pageId, COLORS.white);
  builder.tricolor(pageId, 0, 0.13);
  await builder.image(pageId, path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"), 0.28, 0.37, 2.69, 2.69);
  await builder.logo(pageId, 2.04, 1.94, 5.92, 2.5);
  builder.rect(pageId, 0, 6.22, 10, 6.28, COLORS.blue);
  const copy = displayPair(plan);
  if (!copy.highlight) {
    const carouselTitle = balanceLines(copy.intro, 4, 27);
    builder.text(pageId, carouselTitle, { x: 0.65, y: 7.62, w: 8.7, h: 3.25 }, {
      fontSize: slidesFontForLines(carouselTitle, 43, 27, 29, true),
      bold: true,
      color: COLORS.yellow,
    });
  } else {
    const carouselTitle = balanceLines(copy.intro, 2, 31);
    const carouselSubtitle = balanceLines(copy.highlight, 3, 26);
    builder.text(pageId, carouselTitle, { x: 0.65, y: 7.56, w: 8.7, h: 1.42 }, {
      fontSize: slidesFontForLines(carouselTitle, 34, 31, 26, false),
      color: COLORS.white,
    });
    builder.text(pageId, carouselSubtitle, { x: 0.65, y: 9.08, w: 8.7, h: 1.85 }, {
      fontSize: slidesFontForLines(carouselSubtitle, 42, 26, 29, true),
      bold: true,
      color: COLORS.yellow,
    });
  }
  await builder.icons(pageId, 11.42, 0.64);
  builder.tricolor(pageId, 12.37, 0.13);
}

async function buildCarouselContent(builder, pageId, data, index, total) {
  builder.background(pageId, COLORS.white);
  builder.tricolor(pageId, 0, 0.13);
  await builder.logo(pageId, 0.55, 0.35, 2.15, 0.91);
  builder.text(pageId, `${index}/${total}`, { x: 8.6, y: 0.42, w: 0.75, h: 0.34 }, { fontSize: 13, bold: true, color: COLORS.blue });
  builder.rect(pageId, 0, 1.52, 10, 2.65, COLORS.green);
  await builder.image(pageId, path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"), 6.95, 1.73, 2.15, 2.15);
  builder.text(pageId, normalizedText(data.title), { x: 0.68, y: 1.88, w: 6.35, h: 1.75 }, {
    fontSize: 38,
    bold: true,
    color: COLORS.white,
    align: "left",
  });
  builder.text(pageId, data.body || data.title, { x: 0.75, y: 4.75, w: 8.5, h: 6.15 }, {
    fontSize: 21,
    color: COLORS.ink,
    align: "left",
    valign: "top",
    lineSpacing: 108,
  });
  builder.rect(pageId, 0, 11.22, 10, 1.15, COLORS.blue);
  await builder.icons(pageId, 11.43, 0.61);
  builder.tricolor(pageId, 12.37, 0.13);
}

async function buildCarouselClosing(builder, pageId, data, index, total) {
  builder.background(pageId, COLORS.blue);
  builder.tricolor(pageId, 0, 0.13);
  await builder.image(pageId, path.join(rootDir, "assets", "graphics", "brasil-dots-yellow.png"), 5.9, 0.72, 3.25, 3.25);
  builder.text(pageId, `${index}/${total}`, { x: 8.6, y: 0.42, w: 0.75, h: 0.34 }, { fontSize: 13, bold: true, color: COLORS.white });
  builder.rect(pageId, 0.5, 0.38, 2.82, 1.36, COLORS.white);
  await builder.logo(pageId, 0.68, 0.56, 2.4, 1.02);
  builder.text(pageId, normalizedText(data.title), { x: 0.82, y: 3.25, w: 8.36, h: 2.25 }, {
    fontSize: 43,
    bold: true,
    color: COLORS.white,
  });
  builder.text(pageId, data.body, { x: 1.02, y: 6, w: 7.96, h: 3.5 }, {
    fontSize: 24,
    color: COLORS.yellow,
    valign: "top",
    lineSpacing: 108,
  });
  await builder.icons(pageId, 11.35, 0.64);
  builder.tricolor(pageId, 12.37, 0.13);
}

// uploader(name, buffer, mime) deve devolver uma URL pública temporária para o createImage.
export async function generateSlidesRequests(plan, image, uploader) {
  const builder = new SlidesBuilder(uploader);

  if (plan.templateId === "carousel" && Array.isArray(plan.slides) && plan.slides.length > 1) {
    const coverId = builder.page();
    await buildCarouselCover(builder, coverId, plan);
    const total = plan.slides.length;
    for (let offset = 0; offset < plan.slides.length - 1; offset += 1) {
      const data = plan.slides[offset + 1];
      const pageId = builder.page();
      const index = offset + 2;
      if (isClosingSlide(data)) await buildCarouselClosing(builder, pageId, data, index, total);
      else await buildCarouselContent(builder, pageId, data, index, total);
    }
    return builder.requests;
  }

  const pageId = builder.page();
  if (["photo-green", "photo-blue", "photo-signature"].includes(plan.templateId)) {
    await buildPhotoCover(builder, pageId, plan, image);
  } else if (plan.templateId === "question") {
    await buildQuestion(builder, pageId, plan);
  } else if (plan.templateId === "institutional") {
    await buildInstitutional(builder, pageId, plan);
  } else {
    await buildCarouselCover(builder, pageId, plan);
  }
  return builder.requests;
}
