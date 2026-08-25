import assert from "node:assert/strict";
import test from "node:test";
import { duplicateSlidePlan, photoFillRequests, planBatchRequests } from "../lib/google-delivery.mjs";
import { generateBatchSlidesRequests, generatePlanPages } from "../lib/generate-slides.mjs";

const uploader = async () => "https://exemplo.invalido/imagem.png";

/** Slide do mestre como a Slides API o devolve, reduzido ao que o código usa. */
function masterSlide(objectId = "slide_mestre") {
  return {
    objectId,
    pageElements: [
      {
        objectId: "foto",
        size: { width: { magnitude: 720, unit: "PT" }, height: { magnitude: 900, unit: "PT" } },
        image: { contentUrl: "https://exemplo.invalido/foto.jpg" },
      },
      {
        objectId: "apoio",
        size: { width: { magnitude: 436, unit: "PT" }, height: { magnitude: 40, unit: "PT" } },
        shape: {
          text: {
            textElements: [{ textRun: { content: "TEXTO COM APOIO", style: { fontSize: { magnitude: 18, unit: "PT" } } } }],
          },
        },
      },
      {
        objectId: "destaque",
        size: { width: { magnitude: 394, unit: "PT" }, height: { magnitude: 152, unit: "PT" } },
        shape: {
          text: {
            textElements: [{ textRun: { content: "DESTAQUE DO MESTRE", style: { fontSize: { magnitude: 40, unit: "PT" }, bold: true } } }],
          },
        },
      },
    ],
  };
}

const target = {
  intro: "GLOSSÁRIO DO CARAVANISTA:",
  highlight: "ENTENDA OS TERMOS TÉCNICOS DE FORMA SIMPLES",
};

test("a duplicata recebe ids previsíveis para todos os elementos", () => {
  const source = masterSlide();
  const plan = duplicateSlidePlan(source, "anfatre_p2_");

  assert.equal(plan.slideId, "anfatre_p2_slide");
  assert.deepEqual(plan.request.duplicateObject.objectIds, {
    slide_mestre: "anfatre_p2_slide",
    foto: "anfatre_p2_el0",
    apoio: "anfatre_p2_el1",
    destaque: "anfatre_p2_el2",
  });
  assert.equal(plan.idFor("destaque"), "anfatre_p2_el2");
  // Um id fora do mapa não pode virar `undefined` no meio de um batchUpdate.
  assert.equal(plan.idFor("desconhecido"), "desconhecido");
});

test("o preenchimento endereça a cópia, nunca o slide original", () => {
  const source = masterSlide();
  const plan = duplicateSlidePlan(source, "anfatre_p2_");
  const requests = photoFillRequests(source, plan.idFor, target, "https://exemplo.invalido/nova.jpg");

  const touched = new Set(requests.map((request) => Object.values(request)[0].objectId ?? Object.values(request)[0].imageObjectId));
  assert.deepEqual([...touched].sort(), ["anfatre_p2_el0", "anfatre_p2_el1", "anfatre_p2_el2"]);
  for (const id of touched) assert.match(id, /^anfatre_p2_/);
});

test("editar no lugar continua endereçando o próprio slide", () => {
  const source = masterSlide();
  const requests = photoFillRequests(source, (id) => id, target, null);
  const ids = new Set(requests.map((request) => Object.values(request)[0].objectId));
  assert.deepEqual([...ids].sort(), ["apoio", "destaque"]);
  // Sem foto nova, nenhum replaceImage é emitido.
  assert.equal(requests.filter((request) => request.replaceImage).length, 0);
});

test("o texto do destaque vai quebrado e com o corpo medido", () => {
  const requests = photoFillRequests(masterSlide(), (id) => id, target, null);
  const insert = requests.find((request) => request.insertText?.objectId === "destaque");
  assert.deepEqual(insert.insertText.text.split("\n"), ["ENTENDA OS", "TERMOS TÉCNICOS", "DE FORMA SIMPLES"]);

  const style = requests.find((request) => request.updateTextStyle?.objectId === "destaque");
  assert.ok(style.updateTextStyle.style.fontSize.magnitude <= 40);
  assert.match(style.updateTextStyle.fields, /fontSize/);
});

test("cada post do lote recebe ids próprios, sem colisão", async () => {
  const plan = (over) => ({
    templateId: "question",
    jobTitle: "J",
    intro: "",
    highlight: "Você sabe quem são os nossos associados?",
    closing: "Acesse nosso site.",
    copyOrder: "highlight-only",
    slides: [],
    ...over,
  });

  const { requests, pages } = await generateBatchSlidesRequests([
    { plan: plan(), image: null },
    { plan: plan({ templateId: "institutional", intro: "Uma frase", highlight: "Um destaque" }), image: null },
    { plan: plan({ templateId: "carousel", intro: "Título", highlight: "Arraste" }), image: null },
  ], uploader);

  // Só as requisições que criam objeto declaram um id novo; as demais apenas
  // referenciam o que já existe, e repetir a referência é o esperado.
  const created = requests
    .flatMap((request) => [request.createSlide, request.createShape, request.createImage])
    .filter(Boolean)
    .map((request) => request.objectId);
  assert.equal(new Set(created).size, created.length, "há ids repetidos entre os posts do lote");
  assert.ok(created.length > 20, "o lote deveria criar vários objetos");

  // E toda referência precisa apontar para algo que o próprio lote criou.
  const referenced = requests
    .flatMap((request) => Object.values(request))
    .map((payload) => payload?.objectId)
    .filter(Boolean);
  for (const id of referenced) assert.ok(created.includes(id), `${id} é referenciado mas nunca criado`);

  assert.equal(pages.length, 3);
  for (const page of pages) assert.equal(page.pageIds.length, 1);
  assert.equal(new Set(pages.flatMap((page) => page.pageIds)).size, 3);
});

test("um carrossel contribui com todas as suas telas para o arquivo", async () => {
  const carousel = {
    templateId: "carousel",
    jobTitle: "Carrossel",
    intro: "Título do carrossel",
    highlight: "Arraste para o lado",
    closing: "",
    copyOrder: "intro-highlight",
    slides: [
      { number: 1, title: "Capa", body: "" },
      { number: 2, title: "Passo um", body: "Detalhe" },
      { number: 3, title: "Passo dois", body: "Detalhe" },
    ],
  };
  const page = await generatePlanPages(carousel, null, uploader, "p1_");
  assert.equal(page.pageIds.length, 3);
  for (const id of page.pageIds) assert.match(id, /^anfatre_p1_page_/);
});

// --- plano de requisições do lote -------------------------------------------

function masterDeck() {
  // O mestre do Drive tem 15 slides; só as posições usadas importam aqui.
  return Array.from({ length: 15 }, (unused, index) => masterSlide(`mestre_${index + 1}`));
}

function photoPlan(over = {}) {
  return {
    templateId: "photo-blue",
    jobTitle: "Glossário",
    intro: "Glossário do Caravanista:",
    highlight: "entenda os termos técnicos",
    caption: "legenda do glossário",
    closing: "",
    copyOrder: "intro-highlight",
    slides: [],
    ...over,
  };
}

test("o lote duplica antes de apagar e reordena no fim", async () => {
  const slides = masterDeck();
  const entries = [
    { plan: photoPlan(), image: null },
    { plan: photoPlan({ templateId: "photo-green", jobTitle: "Selo" }), image: null },
  ];
  const { requests, orderedSlideIds, posts } = planBatchRequests(slides, entries, [null, null], [null, null]);

  const kinds = requests.map((request) => Object.keys(request)[0]);
  const lastDuplicate = kinds.lastIndexOf("duplicateObject");
  const firstDelete = kinds.indexOf("deleteObject");
  assert.ok(lastDuplicate < firstDelete, "um slide do mestre foi apagado antes de ser duplicado");

  assert.equal(kinds.at(-1), "updateSlidesPosition");
  assert.deepEqual(requests.at(-1).updateSlidesPosition.slideObjectIds, orderedSlideIds);
  assert.equal(requests.at(-1).updateSlidesPosition.insertionIndex, 0);

  // Todos os 15 slides originais saem do arquivo.
  assert.equal(kinds.filter((kind) => kind === "deleteObject").length, 15);
  assert.deepEqual(posts.map((post) => post.title), ["Glossário", "Selo"]);
  assert.deepEqual(posts.map((post) => post.caption), ["legenda do glossário", "legenda do glossário"]);
});

test("a ordem dos slides segue a ordem em que os posts foram selecionados", async () => {
  const slides = masterDeck();
  const built = await generatePlanPages(
    { templateId: "question", jobTitle: "Pergunta", intro: "", highlight: "Vai?", closing: "Responda.", copyOrder: "highlight-only", slides: [] },
    null,
    uploader,
    "p2_",
  );
  const entries = [
    { plan: photoPlan({ jobTitle: "Primeira" }), image: null },
    { plan: { templateId: "question", jobTitle: "Pergunta", intro: "", highlight: "Vai?", closing: "Responda.", copyOrder: "highlight-only", slides: [] }, image: null },
    { plan: photoPlan({ jobTitle: "Terceira" }), image: null },
  ];
  const { orderedSlideIds, posts } = planBatchRequests(slides, entries, [null, null, null], [null, built, null]);

  assert.deepEqual(orderedSlideIds, ["anfatre_p1_slide", ...built.pageIds, "anfatre_p3_slide"]);
  assert.deepEqual(posts.map((post) => post.title), ["Primeira", "Pergunta", "Terceira"]);
});

test("a foto de cada post vai para a duplicata daquele post", () => {
  const slides = masterDeck();
  const entries = [
    { plan: photoPlan({ jobTitle: "Um" }), image: { base64: "x", mimeType: "image/jpeg" } },
    { plan: photoPlan({ jobTitle: "Dois" }), image: { base64: "y", mimeType: "image/jpeg" } },
  ];
  const { requests } = planBatchRequests(slides, entries, ["url/um.jpg", "url/dois.jpg"], [null, null]);

  const replacements = requests.filter((request) => request.replaceImage).map((request) => request.replaceImage);
  assert.equal(replacements.length, 2);
  assert.deepEqual(replacements.map((item) => item.url), ["url/um.jpg", "url/dois.jpg"]);
  assert.match(replacements[0].imageObjectId, /^anfatre_p1_/);
  assert.match(replacements[1].imageObjectId, /^anfatre_p2_/);
});

test("nenhuma requisição do lote endereça um slide do mestre", () => {
  const slides = masterDeck();
  const entries = [
    { plan: photoPlan({ jobTitle: "Um" }), image: null },
    { plan: photoPlan({ jobTitle: "Dois" }), image: null },
  ];
  const { requests } = planBatchRequests(slides, entries, [null, null], [null, null]);
  const masterIds = new Set(slides.flatMap((slide) => [slide.objectId, ...slide.pageElements.map((element) => element.objectId)]));

  for (const request of requests) {
    const [kind, payload] = Object.entries(request)[0];
    // `duplicateObject` e `deleteObject` são justamente os que tocam o original.
    if (kind === "duplicateObject" || kind === "deleteObject") continue;
    const id = payload.objectId ?? payload.imageObjectId;
    if (id) assert.ok(!masterIds.has(id), `${kind} escreveu no slide do mestre (${id})`);
  }
});
