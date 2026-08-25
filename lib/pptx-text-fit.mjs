// Encaixe de texto nas caixas do PPT mestre.
//
// O mestre foi desenhado com `spAutoFit` ("redimensionar forma para caber o texto"),
// que só é recalculado por quem *renderiza* a apresentação. Preenchendo os marcadores
// no servidor sem tocar na geometria, a caixa continuava com a altura do texto de
// exemplo e o excedente vazava para fora do painel colorido.
//
// Aqui a quebra de linha é decidida com as métricas reais da Montserrat, gravada
// explicitamente com `<a:br/>` e a altura da caixa é recalculada. Com isso o autofit
// deixa de ser necessário e vira `<a:noAutofit/>`: o resultado passa a ser idêntico
// no PowerPoint, no Canva, no Google Slides e no LibreOffice.

import {
  LINE_HEIGHT_EM,
  balanceToWidth,
  toEmu,
  toPoints,
  wrapToWidth,
} from "./montserrat-metrics.mjs";

const DEFAULT_INSETS = { l: 91440, r: 91440, t: 45720, b: 45720 };
const DEFAULT_SIZE_HUNDREDTHS = 1800;
const SHRINK_STEP_POINTS = 0.5;

// Uma caixa autofit pode crescer até 1,6x a altura desenhada antes de o corpo ceder.
export const AUTOFIT_GROWTH = 1.6;
// Piso de redução: nunca menos que ~62% do corpo original.
export const SHRINK_FLOOR_RATIO = 0.62;
// Respiro mínimo entre o bloco de texto e as bordas do painel colorido.
export const PANEL_MARGIN_POINTS = 12;
// Acima disso um retângulo deixa de ser "faixa decorativa" e passa a ser painel.
const STRIPE_MAX_HEIGHT_EMU = 200000;

const MARKER_PATTERN = /\{\{[A-Z0-9_]+\}\}/;

export function escapeXmlText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Recorta o elemento `tag` a partir de `from`, respeitando tags autofechadas.
 * Um regex preguiçoso não serve: `<a:rPr>` contém `<a:latin ... />` no meio.
 */
function matchElement(xml, tag, from = 0) {
  const opening = new RegExp(`<${tag}\\b[^>]*>`, "g");
  opening.lastIndex = from;
  const found = opening.exec(xml);
  if (!found) return null;
  if (found[0].endsWith("/>")) {
    const end = found.index + found[0].length;
    return { start: found.index, end, open: found[0], inner: "", full: found[0] };
  }
  const closing = `</${tag}>`;
  const closingIndex = xml.indexOf(closing, opening.lastIndex);
  if (closingIndex < 0) return null;
  const end = closingIndex + closing.length;
  return {
    start: found.index,
    end,
    open: found[0],
    inner: xml.slice(opening.lastIndex, closingIndex),
    full: xml.slice(found.index, end),
  };
}

function geometryOf(shapeXml) {
  const xfrm = matchElement(shapeXml, "a:xfrm");
  if (!xfrm) return null;
  const off = xfrm.full.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/);
  const ext = xfrm.full.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/);
  if (!off || !ext) return null;
  return { x: Number(off[1]), y: Number(off[2]), cx: Number(ext[1]), cy: Number(ext[2]) };
}

function insetsOf(bodyPrXml) {
  const read = (attribute, fallback) => {
    const found = bodyPrXml.match(new RegExp(`\\b${attribute}="(-?\\d+)"`));
    return found ? Number(found[1]) : fallback;
  };
  return {
    l: read("lIns", DEFAULT_INSETS.l),
    r: read("rIns", DEFAULT_INSETS.r),
    t: read("tIns", DEFAULT_INSETS.t),
    b: read("bIns", DEFAULT_INSETS.b),
  };
}

/** Descreve cada `<p:sp>` que carrega um marcador `{{...}}`. */
export function readMarkerShapes(slideXml) {
  const shapes = [];
  for (const match of slideXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const xml = match[0];
    const marker = xml.match(MARKER_PATTERN)?.[0];
    if (!marker) continue;

    const geometry = geometryOf(xml);
    if (!geometry) continue;

    const bodyPr = matchElement(xml, "a:bodyPr");
    const insets = insetsOf(bodyPr?.open || "");

    const markerIndex = xml.indexOf(marker);
    const paragraph = lastElementBefore(xml, "a:p", markerIndex);
    const run = lastElementBefore(xml, "a:r", markerIndex);
    const rPr = run ? matchElement(run.full, "a:rPr") : null;

    const spacing = paragraph?.full.match(/<a:lnSpc>\s*<a:spcPct\s+val="(\d+)"/)?.[1];
    const sizeHundredths = Number(rPr?.open.match(/\bsz="(\d+)"/)?.[1] ?? DEFAULT_SIZE_HUNDREDTHS);

    shapes.push({
      xml,
      marker,
      ...geometry,
      insets,
      autoFit: /<a:spAutoFit\s*\/>/.test(bodyPr?.full || ""),
      lineSpacing: spacing ? Number(spacing) / 100000 : 1,
      basePoints: sizeHundredths / 100,
      bold: /\bb="1"/.test(rPr?.open || ""),
      runXml: run?.full || "",
      rPrXml: rPr?.full || "",
      paragraphXml: paragraph?.full || "",
      usableWidthPoints: toPoints(geometry.cx - insets.l - insets.r),
      innerHeightPoints: toPoints(geometry.cy - insets.t - insets.b),
    });
  }
  return shapes;
}

function lastElementBefore(xml, tag, index) {
  let cursor = 0;
  let last = null;
  for (;;) {
    const found = matchElement(xml, tag, cursor);
    if (!found || found.start > index) break;
    if (found.end > index) return found;
    last = found;
    cursor = found.end;
  }
  return last;
}

/**
 * Região útil do painel colorido: do fim das faixas amarelas até a base do painel.
 * É onde o bloco intro + destaque precisa caber e ficar centralizado.
 */
export function readPanelRegion(slideXml) {
  const plain = [];
  for (const match of slideXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    if (MARKER_PATTERN.test(match[0])) continue;
    const geometry = geometryOf(match[0]);
    if (geometry) plain.push(geometry);
  }
  if (!plain.length) return null;

  const panel = plain.reduce((widest, shape) => (
    shape.cx * shape.cy > widest.cx * widest.cy ? shape : widest
  ));
  const panelBottom = panel.y + panel.cy;

  const stripesBottom = plain.reduce((bottom, shape) => {
    if (shape === panel || shape.cy > STRIPE_MAX_HEIGHT_EMU) return bottom;
    if (shape.y < panel.y || shape.y >= panelBottom) return bottom;
    return Math.max(bottom, shape.y + shape.cy);
  }, panel.y);

  return { top: stripesBottom, bottom: panelBottom, height: panelBottom - stripesBottom };
}

/**
 * Maior corpo, entre `basePoints` e o piso, em que `text` cabe na largura da caixa
 * e em `availableHeightPoints` de altura. Devolve `null` quando nem o piso resolve.
 */
export function fitText(shape, text, availableHeightPoints, floorPoints = shape.basePoints) {
  if (!text) {
    return { lines: [], sizePoints: shape.basePoints, heightPoints: 0 };
  }
  const floor = Math.max(floorPoints, 8);
  for (let size = shape.basePoints; size >= floor - 0.001; size -= SHRINK_STEP_POINTS) {
    const lineHeight = size * LINE_HEIGHT_EM * shape.lineSpacing;
    // A tolerância de 0,05 linha absorve a diferença entre a métrica `hhea` (1,219)
    // e o arredondamento do PowerPoint (~1,2125) em caixas desenhadas no limite.
    const maxLines = Math.max(1, Math.floor(availableHeightPoints / lineHeight + 0.05));
    const lines = balanceToWidth(text, size, shape.usableWidthPoints, shape.bold, maxLines);
    if (lines) return { lines, sizePoints: size, heightPoints: lines.length * lineHeight };
  }
  return null;
}

/** Encaixe que nunca falha: no piso, aceitando quantas linhas forem necessárias. */
export function forceFitText(shape, text, floorPoints) {
  const size = Math.max(floorPoints, 8);
  const lineHeight = size * LINE_HEIGHT_EM * shape.lineSpacing;
  const lines = wrapToWidth(text, size, shape.usableWidthPoints, shape.bold, Number.MAX_SAFE_INTEGER)
    || [text];
  return { lines, sizePoints: size, heightPoints: lines.length * lineHeight };
}

/** Altura total que a caixa precisa ter para o encaixe `fit`, em EMU. */
export function boxHeightFor(shape, fit) {
  return toEmu(fit.heightPoints) + shape.insets.t + shape.insets.b;
}

function rPrWithSize(rPrXml, sizePoints) {
  const hundredths = Math.round(sizePoints * 100);
  const source = rPrXml || "<a:rPr/>";
  if (/\bsz="\d+"/.test(source)) return source.replace(/\bsz="\d+"/, `sz="${hundredths}"`);
  return source.replace(/^<a:rPr\b/, `<a:rPr sz="${hundredths}"`);
}

function withExplicitLines(shapeXml, shape, fit) {
  const rPr = rPrWithSize(shape.rPrXml, fit.sizePoints);
  const lines = fit.lines.length ? fit.lines : [""];
  // Cada linha vira um run próprio separado por `<a:br/>`: a quebra deixa de depender
  // do cálculo de largura de quem abre o arquivo. O `<a:br>` leva o mesmo `rPr` porque
  // alguns renderizadores dimensionam a quebra pelo padrão do parágrafo, não pelo run.
  const runs = lines
    .map((line) => `<a:r>${rPr}<a:t>${escapeXmlText(line)}</a:t></a:r>`)
    .join(`<a:br>${rPr}</a:br>`);

  if (!shape.paragraphXml) return shapeXml.replace(shape.runXml, runs);

  // `defRPr` é o corpo padrão do parágrafo; deixá-lo defasado faria a quebra e
  // qualquer texto digitado depois voltarem ao tamanho antigo.
  const paragraph = shape.paragraphXml
    .replace(shape.runXml, runs)
    .replace(/(<a:defRPr\b[^>]*?)\bsz="\d+"/, `$1sz="${Math.round(fit.sizePoints * 100)}"`);
  return shapeXml.replace(shape.paragraphXml, paragraph);
}

function withoutAutoFit(shapeXml) {
  const bodyPr = matchElement(shapeXml, "a:bodyPr");
  if (!bodyPr) return shapeXml;

  let replacement;
  if (/<a:spAutoFit\s*\/>|<a:normAutofit\b[^>]*\/>/.test(bodyPr.full)) {
    replacement = bodyPr.full.replace(/<a:spAutoFit\s*\/>|<a:normAutofit\b[^>]*\/>/, "<a:noAutofit/>");
  } else if (bodyPr.full.endsWith("/>")) {
    replacement = `${bodyPr.open.slice(0, -2)}><a:noAutofit/></a:bodyPr>`;
  } else {
    replacement = `${bodyPr.open}<a:noAutofit/>${bodyPr.inner}</a:bodyPr>`;
  }
  return shapeXml.slice(0, bodyPr.start) + replacement + shapeXml.slice(bodyPr.end);
}

function withGeometry(shapeXml, { y, cy }) {
  const xfrm = matchElement(shapeXml, "a:xfrm");
  if (!xfrm) return shapeXml;
  const updated = xfrm.full
    .replace(/(<a:off\s+x="-?\d+"\s+y=")-?\d+(")/, `$1${Math.round(y)}$2`)
    .replace(/(<a:ext\s+cx="\d+"\s+cy=")\d+(")/, `$1${Math.round(cy)}$2`);
  return shapeXml.slice(0, xfrm.start) + updated + shapeXml.slice(xfrm.end);
}

/**
 * Reescreve a forma no slide: texto quebrado, corpo ajustado, autofit desligado e,
 * quando `geometry` é informado, nova altura e nova posição vertical.
 */
export function applyFit(slideXml, shape, fit, geometry = null) {
  let updated = withExplicitLines(shape.xml, shape, fit);
  updated = withoutAutoFit(updated);
  if (geometry) updated = withGeometry(updated, geometry);
  return slideXml.replace(shape.xml, updated);
}
