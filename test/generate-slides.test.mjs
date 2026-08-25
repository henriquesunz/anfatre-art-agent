import assert from "node:assert/strict";
import test from "node:test";
import { generateSlidesRequests } from "../lib/generate-slides.mjs";
import { fitPhotoMasterPanel, PHOTO_MASTER_SIZES } from "../lib/generate-design.mjs";
import { measurePoints } from "../lib/montserrat-metrics.mjs";

const uploader = async () => "https://exemplo.invalido/imagem.png";

function plan(overrides = {}) {
  return {
    templateId: "photo-blue",
    jobTitle: "Glossário do Caravanista",
    intro: "Glossário do Caravanista:",
    highlight: "entenda os termos técnicos de forma simples",
    closing: "",
    copyOrder: "intro-highlight",
    slides: [],
    ...overrides,
  };
}

/** Junta cada caixa de texto criada com o tamanho e a largura que receberam. */
function textBoxes(requests) {
  const shapes = new Map();
  for (const request of requests) {
    if (request.createShape?.shapeType === "TEXT_BOX") {
      const size = request.createShape.elementProperties.size;
      shapes.set(request.createShape.objectId, { widthPoints: size.width.magnitude });
    }
    if (request.insertText && shapes.has(request.insertText.objectId)) {
      shapes.get(request.insertText.objectId).text = request.insertText.text;
    }
    if (request.updateTextStyle && shapes.has(request.updateTextStyle.objectId)) {
      const shape = shapes.get(request.updateTextStyle.objectId);
      shape.sizePoints = request.updateTextStyle.style.fontSize.magnitude;
      shape.weight = request.updateTextStyle.style.weightedFontFamily?.weight === 800
        ? "extrabold"
        : (request.updateTextStyle.style.bold ? "bold" : "regular");
    }
  }
  return [...shapes.values()].filter((shape) => shape.text);
}

const variations = [
  { templateId: "photo-blue" },
  { templateId: "photo-green" },
  { templateId: "photo-blue", copyOrder: "highlight-intro" },
  { templateId: "photo-blue", intro: "Uma linha", highlight: "Destaque" },
  { templateId: "photo-signature" },
  {
    templateId: "photo-blue",
    intro: "Guia rápido para quem está começando agora na estrada",
    highlight: "tudo o que você precisa saber antes de comprar o seu primeiro motorhome usado com segurança",
  },
  { templateId: "question", intro: "", highlight: "Você sabe quem são os nossos associados?", closing: "Acesse nosso site e confira a lista completa." },
  { templateId: "institutional" },
  { templateId: "carousel" },
];

test("nenhuma linha enviada ao Slides ultrapassa a largura da caixa", async () => {
  for (const variation of variations) {
    const requests = await generateSlidesRequests(plan(variation), null, uploader);
    for (const shape of textBoxes(requests)) {
      // Recuo interno padrão do mestre: 0,1" de cada lado.
      const usable = shape.widthPoints - 14.4;
      for (const line of shape.text.split("\n")) {
        const width = measurePoints(line, shape.sizePoints, shape.weight);
        assert.ok(
          width <= usable + 0.5,
          `${JSON.stringify(variation)} · "${line}" ocupa ${width.toFixed(1)}pt em ${usable.toFixed(1)}pt`,
        );
      }
    }
  }
});

test("o texto vai com as quebras resolvidas, sem depender do Slides", async () => {
  const requests = await generateSlidesRequests(plan(), null, uploader);
  const highlight = textBoxes(requests).find((shape) => shape.text.includes("ENTENDA"));
  assert.deepEqual(highlight.text.split("\n"), ["ENTENDA OS", "TERMOS TÉCNICOS", "DE FORMA SIMPLES"]);
});

test("a copy longa do azul usa o layout dedicado no corpo desenhado", () => {
  const fitted = fitPhotoMasterPanel(
    "Glossário do Caravanista:",
    "entenda os termos técnicos de forma simples",
    false,
    { allowLongCopy: true },
  );
  assert.equal(fitted.variant, "longCopy");
  assert.equal(fitted.highlight.fontSize, PHOTO_MASTER_SIZES.highlight.longCopy);
});

test("o verde não tem layout de copy longa e reduz o corpo na variação 3", () => {
  const fitted = fitPhotoMasterPanel(
    "Glossário do Caravanista:",
    "entenda os termos técnicos de forma simples",
    false,
    { allowLongCopy: false },
  );
  assert.equal(fitted.variant, 3);
  assert.ok(fitted.highlight.fontSize < PHOTO_MASTER_SIZES.highlight[3]);
  assert.ok(fitted.highlight.fontSize >= PHOTO_MASTER_SIZES.highlight[3] * 0.62);
});

test("os corpos do painel saem em pontos, não nos pixels do mestre", () => {
  const fitted = fitPhotoMasterPanel("Apoio", "Destaque", false);
  assert.equal(fitted.variant, 1);
  assert.equal(fitted.intro.fontSize, 18);
  assert.equal(fitted.highlight.fontSize, 54);
});
