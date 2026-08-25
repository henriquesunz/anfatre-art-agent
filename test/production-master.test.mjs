import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { generateDesignPptx } from "../lib/generate-design.mjs";
import {
  PRODUCTION_MASTER_PATH,
  selectProductionSlide,
} from "../lib/production-master.mjs";

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

test("seleciona as variações aprovadas do mestre de produção", () => {
  assert.equal(selectProductionSlide(plan({ intro: "Uma linha", highlight: "Destaque" })), 1);
  assert.equal(selectProductionSlide(plan({ intro: "Texto de apoio com conteúdo suficiente para ocupar duas linhas", highlight: "Destaque" })), 2);
  assert.equal(selectProductionSlide(plan({ copyOrder: "highlight-intro", intro: "Apoio", highlight: "Destaque" })), 4);
  assert.equal(selectProductionSlide(plan({ templateId: "photo-blue", copyOrder: "highlight-intro", intro: "Apoio", highlight: "Destaque" })), 12);
  assert.equal(selectProductionSlide(plan({ templateId: "photo-signature" })), 15);
  assert.equal(selectProductionSlide(plan({ templateId: "question" })), 20);
  assert.equal(selectProductionSlide(plan({ templateId: "institutional" })), 21);
  assert.equal(selectProductionSlide(plan({ templateId: "carousel" })), 22);
});

test("gera um post a partir de um único slide do anfatre-production-master", async () => {
  const sourceZip = await JSZip.loadAsync(await fs.readFile(PRODUCTION_MASTER_PATH));
  const bytes = await generateDesignPptx(plan({ templateId: "photo-blue" }));
  const outputZip = await JSZip.loadAsync(bytes);
  const presentationXml = await outputZip.file("ppt/presentation.xml").async("string");
  const slideXml = await outputZip.file("ppt/slides/slide1.xml").async("string");

  assert.equal(visibleSlideCount(presentationXml), 1);
  assert.match(slideXml, /GLOSSÁRIO DO CARAVANISTA:/);
  assert.match(slideXml, /ENTENDA OS TERMOS TÉCNICOS DE FORMA SIMPLES/);
  assert.doesNotMatch(slideXml, /\{\{[A-Z0-9_]+\}\}/);

  const sourceTheme = await sourceZip.file("ppt/theme/theme1.xml").async("nodebuffer");
  const outputTheme = await outputZip.file("ppt/theme/theme1.xml").async("nodebuffer");
  assert.deepEqual(outputTheme, sourceTheme);
});

test("substitui a fotografia e aplica corte cover sem esticar", async () => {
  const squarePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS0AAAAASUVORK5CYII=",
    "base64",
  );
  const bytes = await generateDesignPptx(plan(), {
    base64: squarePng.toString("base64"),
    mimeType: "image/png",
  });
  const outputZip = await JSZip.loadAsync(bytes);
  const slideXml = await outputZip.file("ppt/slides/slide1.xml").async("string");
  const relationships = await outputZip.file("ppt/slides/_rels/slide1.xml.rels").async("string");

  assert.ok(outputZip.file("ppt/media/generated-photo.png"));
  assert.match(relationships, /\/ppt\/media\/generated-photo\.png/);
  assert.match(slideXml, /<a:srcRect l="10000" r="10000"/);
});

test("preenche pergunta e fechamento no layout institucional de CTA", async () => {
  const bytes = await generateDesignPptx(plan({
    templateId: "question",
    intro: "",
    highlight: "Você sabe quem são os nossos associados?",
    closing: "Acesse nosso site e confira a lista completa.",
  }));
  const outputZip = await JSZip.loadAsync(bytes);
  const slideXml = await outputZip.file("ppt/slides/slide1.xml").async("string");

  assert.match(slideXml, /VOCÊ SABE QUEM SÃO OS NOSSOS ASSOCIADOS\?/);
  assert.match(slideXml, /Acesse nosso site e confira a lista completa\./);
  assert.doesNotMatch(slideXml, /\{\{[A-Z0-9_]+\}\}/);
});
