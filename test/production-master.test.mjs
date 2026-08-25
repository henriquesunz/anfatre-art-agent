import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { generateDesignPptx } from "../lib/generate-design.mjs";
import {
  PRODUCTION_MASTER_PATH,
  resolveProductionLayout,
  selectProductionSlide,
} from "../lib/production-master.mjs";
import { LINE_HEIGHT_EM, measurePoints, toPoints } from "../lib/montserrat-metrics.mjs";

function plan(overrides = {}) {
  return {
    templateId: "photo-green",
    jobTitle: "Glossário do Caravanista",
    intro: "Glossário do Caravanista:",
    highlight: "entenda os termos técnicos de forma simples",
    closing: "",
    copyOrder: "intro-highlight",
    slides: [],
    ...overrides,
  };
}

function visibleSlideCount(presentationXml) {
  const list = presentationXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || "";
  return [...list.matchAll(/<p:sldId\b[^>]*\/>/g)].length;
}

/** Formas com texto: geometria, corpo aplicado e as linhas já quebradas. */
function textShapes(slideXml) {
  const shapes = [];
  for (const match of slideXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const xml = match[0];
    const lines = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((item) => item[1]).filter(Boolean);
    if (!lines.length) continue;
    const off = xml.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
    const ext = xml.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    shapes.push({
      xml,
      name: xml.match(/name="([^"]*)"/)[1],
      lines,
      y: Number(off[2]),
      cy: Number(ext[2]),
      cx: Number(ext[1]),
      sizePoints: Number(xml.match(/<a:r><a:rPr[^>]*\bsz="(\d+)"/)[1]) / 100,
      bold: /<a:r><a:rPr[^>]*\bb="1"/.test(xml),
    });
  }
  return shapes;
}

/** O retângulo colorido de fundo do painel fotográfico. */
function panelBox(slideXml) {
  const boxes = [];
  for (const match of slideXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    if (/<a:t>[^<]/.test(match[0])) continue;
    const off = match[0].match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
    const ext = match[0].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    if (off && ext) boxes.push({ y: Number(off[2]), cy: Number(ext[2]), cx: Number(ext[1]) });
  }
  return boxes.reduce((widest, box) => (box.cx * box.cy > widest.cx * widest.cy ? box : widest));
}

async function slideXmlFor(planOverrides, image = null) {
  const bytes = await generateDesignPptx(plan(planOverrides), image);
  const zip = await JSZip.loadAsync(bytes);
  return { zip, slideXml: await zip.file("ppt/slides/slide1.xml").async("string") };
}

test("mede o texto para escolher a variação do mestre de produção", async () => {
  assert.equal(await selectProductionSlide(plan({ intro: "Uma linha", highlight: "Destaque" })), 1);
  assert.equal(await selectProductionSlide(plan({
    intro: "Texto de apoio com conteúdo suficiente para ocupar duas linhas",
    highlight: "Destaque",
  })), 2);
  assert.equal(await selectProductionSlide(plan({ copyOrder: "highlight-intro", intro: "Apoio", highlight: "Destaque" })), 4);
  assert.equal(await selectProductionSlide(plan({ templateId: "photo-blue", copyOrder: "highlight-intro", intro: "Apoio", highlight: "Destaque" })), 12);
  assert.equal(await selectProductionSlide(plan({ templateId: "photo-signature" })), 15);
  assert.equal(await selectProductionSlide(plan({ templateId: "question" })), 20);
  assert.equal(await selectProductionSlide(plan({ templateId: "institutional" })), 21);
  assert.equal(await selectProductionSlide(plan({ templateId: "carousel" })), 22);
});

test("copy longa no azul cai no layout dedicado, sem reduzir o corpo", async () => {
  // O destaque tem 43 caracteres: entra em 4 linhas no layout de 40pt e por isso
  // precisa do slide 16, desenhado para copy longa. A regra antiga estimava 17
  // caracteres por linha, previa 3 linhas e deixava a quarta vazar do painel.
  const layout = await resolveProductionLayout(plan({ templateId: "photo-blue" }));
  assert.equal(layout.slideNumber, 16);
  assert.equal(layout.shrunk, false);
});

test("gera um post a partir de um único slide do anfatre-production-master", async () => {
  const sourceZip = await JSZip.loadAsync(await fs.readFile(PRODUCTION_MASTER_PATH));
  const { zip, slideXml } = await slideXmlFor({ templateId: "photo-blue" });
  const presentationXml = await zip.file("ppt/presentation.xml").async("string");

  assert.equal(visibleSlideCount(presentationXml), 1);
  assert.doesNotMatch(slideXml, /\{\{[A-Z0-9_]+\}\}/);

  const shapes = textShapes(slideXml);
  assert.deepEqual(shapes.find((shape) => shape.name === "TextBox 12").lines, ["GLOSSÁRIO DO CARAVANISTA:"]);
  assert.deepEqual(
    shapes.find((shape) => shape.name === "TextBox 13").lines,
    ["ENTENDA OS", "TERMOS TÉCNICOS", "DE FORMA SIMPLES"],
  );

  const sourceTheme = await sourceZip.file("ppt/theme/theme1.xml").async("nodebuffer");
  const outputTheme = await zip.file("ppt/theme/theme1.xml").async("nodebuffer");
  assert.deepEqual(outputTheme, sourceTheme);
});

test("nenhuma linha ultrapassa a largura útil da caixa", async () => {
  const variations = [
    { templateId: "photo-blue" },
    { templateId: "photo-green" },
    { templateId: "photo-blue", copyOrder: "highlight-intro" },
    { templateId: "photo-blue", intro: "Uma linha", highlight: "Destaque" },
    {
      templateId: "photo-blue",
      intro: "Guia rápido para quem está começando agora na estrada",
      highlight: "tudo o que você precisa saber antes de comprar o seu primeiro motorhome usado com segurança",
    },
    { templateId: "photo-signature" },
    { templateId: "carousel" },
    { templateId: "institutional" },
  ];

  for (const variation of variations) {
    const { slideXml } = await slideXmlFor(variation);
    for (const shape of textShapes(slideXml)) {
      // 91440 EMU de recuo lateral padrão de cada lado.
      const usableWidth = toPoints(shape.cx - 2 * 91440);
      for (const line of shape.lines) {
        const width = measurePoints(line, shape.sizePoints, shape.bold);
        assert.ok(
          width <= usableWidth + 0.5,
          `${JSON.stringify(variation)} · "${line}" ocupa ${width.toFixed(1)}pt em ${usableWidth.toFixed(1)}pt`,
        );
      }
    }
  }
});

test("o bloco de texto fica dentro do painel colorido e centralizado nele", async () => {
  for (const variation of [
    { templateId: "photo-blue" },
    { templateId: "photo-green" },
    { templateId: "photo-blue", intro: "Uma linha", highlight: "Destaque" },
    { templateId: "photo-blue", copyOrder: "highlight-intro" },
  ]) {
    const { slideXml } = await slideXmlFor(variation);
    const panel = panelBox(slideXml);
    const shapes = textShapes(slideXml);
    const top = Math.min(...shapes.map((shape) => shape.y));
    const bottom = Math.max(...shapes.map((shape) => shape.y + shape.cy));

    assert.ok(top >= panel.y, `${JSON.stringify(variation)} · texto começa acima do painel`);
    assert.ok(
      bottom <= panel.y + panel.cy,
      `${JSON.stringify(variation)} · texto termina ${bottom - panel.y - panel.cy} EMU abaixo do painel`,
    );

    // As faixas amarelas ocupam o topo do painel; o bloco se centraliza no que sobra.
    const region = { top: 1579149, bottom: panel.y + panel.cy };
    const folgaSuperior = top - region.top;
    const folgaInferior = region.bottom - bottom;
    assert.ok(
      Math.abs(folgaSuperior - folgaInferior) <= 12700,
      `${JSON.stringify(variation)} · bloco descentralizado (${folgaSuperior} vs ${folgaInferior})`,
    );
  }
});

test("a altura da caixa acompanha o número de linhas e o autofit é desligado", async () => {
  const { slideXml } = await slideXmlFor({ templateId: "photo-blue" });
  assert.doesNotMatch(slideXml, /<a:spAutoFit\s*\/>/);
  assert.match(slideXml, /<a:noAutofit\/>/);
  assert.match(slideXml, /<a:br>/);

  for (const shape of textShapes(slideXml)) {
    const spacing = /<a:spcPct val="150000"/.test(shape.xml) ? 1.5 : 1;
    const expected = shape.lines.length * shape.sizePoints * LINE_HEIGHT_EM * spacing;
    const inner = toPoints(shape.cy) - toPoints(2 * 45720);
    assert.ok(
      Math.abs(inner - expected) <= 1,
      `${shape.name} · caixa de ${inner.toFixed(1)}pt para ${expected.toFixed(1)}pt de texto`,
    );
  }
});

test("copy que não cabe reduz o corpo em vez de vazar", async () => {
  const layout = await resolveProductionLayout(plan({
    templateId: "photo-green",
    intro: "Guia rápido para quem está começando agora na estrada com a família",
    highlight: "tudo o que você precisa saber antes de comprar o seu primeiro motorhome usado com segurança",
  }));
  assert.equal(layout.shrunk, true);

  const shapes = textShapes(layout.slideXml);
  const highlight = shapes.find((shape) => shape.name === "TextBox 13");
  assert.ok(highlight.sizePoints < 40, "o destaque deveria ter reduzido");
  // Piso de redução: nunca abaixo de 62% do corpo desenhado.
  assert.ok(highlight.sizePoints >= 40 * 0.62, "reduziu além do piso permitido");
});

test("substitui a fotografia e aplica corte cover sem esticar", async () => {
  const squarePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS0AAAAASUVORK5CYII=",
    "base64",
  );
  const { zip, slideXml } = await slideXmlFor({}, {
    base64: squarePng.toString("base64"),
    mimeType: "image/png",
  });
  const relationships = await zip.file("ppt/slides/_rels/slide1.xml.rels").async("string");

  assert.ok(zip.file("ppt/media/generated-photo.png"));
  assert.match(relationships, /\/ppt\/media\/generated-photo\.png/);
  assert.match(slideXml, /<a:srcRect l="10000" r="10000"/);
});

test("preenche pergunta e fechamento no layout institucional de CTA", async () => {
  const { slideXml } = await slideXmlFor({
    templateId: "question",
    intro: "",
    highlight: "Você sabe quem são os nossos associados?",
    closing: "Acesse nosso site e confira a lista completa.",
  });
  const shapes = textShapes(slideXml);

  assert.equal(
    shapes.find((shape) => shape.name === "pergunta-editavel").lines.join(" "),
    "VOCÊ SABE QUEM SÃO OS NOSSOS ASSOCIADOS?",
  );
  assert.equal(
    shapes.find((shape) => shape.name === "fechamento-tail-editavel").lines.join(" "),
    "Acesse nosso site e confira a lista completa.",
  );
  assert.doesNotMatch(slideXml, /\{\{[A-Z0-9_]+\}\}/);
});
