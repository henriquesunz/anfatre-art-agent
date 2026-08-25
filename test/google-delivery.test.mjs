import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  MASTER_SLIDE_INDEX,
  MASTER_TEMPLATE_FIXTURE,
  masterSlideNumber,
} from "../lib/google-delivery.mjs";
import { fitPhotoMasterPanel } from "../lib/generate-design.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function slideCount(fixture) {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(rootDir, "fixtures", fixture)));
  const xml = await zip.file("ppt/presentation.xml").async("string");
  const list = xml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || "";
  return [...list.matchAll(/<p:sldId\b[^>]*\/>/g)].length;
}

test("o template do Drive e o mestre de produção são arquivos distintos", async () => {
  // A entrega no Google copia `ppt-mestre.pptx`; o gerador de PPTX usa
  // `anfatre-production-master.pptx`. As numerações não coincidem — misturá-las
  // já apontou para um slide inexistente e derrubou a criação da arte.
  assert.notEqual(await slideCount(MASTER_TEMPLATE_FIXTURE), await slideCount("anfatre-production-master.pptx"));
});

test("todo slide do índice existe no template enviado ao Drive", async () => {
  const total = await slideCount(MASTER_TEMPLATE_FIXTURE);
  for (const [tone, orders] of Object.entries(MASTER_SLIDE_INDEX)) {
    for (const [order, numbers] of Object.entries(orders)) {
      for (const number of [numbers].flat()) {
        assert.ok(
          Number.isInteger(number) && number >= 1 && number <= total,
          `${tone}.${order}: slide ${number} fora do intervalo 1..${total}`,
        );
      }
    }
  }
});

test("toda variação medida resolve para um slide que existe", async () => {
  const total = await slideCount(MASTER_TEMPLATE_FIXTURE);
  const copies = [
    ["Uma linha", "Destaque"],
    ["Texto de apoio com conteúdo suficiente para ocupar duas linhas", "Destaque"],
    ["Glossário do Caravanista:", "entenda os termos técnicos de forma simples"],
    [
      "Guia rápido para quem está começando agora na estrada",
      "tudo o que você precisa saber antes de comprar o seu primeiro motorhome usado com segurança",
    ],
  ];

  for (const tone of ["green", "blue"]) {
    for (const highlightFirst of [false, true]) {
      for (const [intro, highlight] of copies) {
        const fitted = fitPhotoMasterPanel(intro, highlight, highlightFirst, {
          highlightWeight: "bold",
          allowLongCopy: Boolean(MASTER_SLIDE_INDEX[tone].longCopy),
        });
        assert.notEqual(fitted.variant, "longCopy", `${tone}: este template não tem layout de copy longa`);

        const number = masterSlideNumber(tone, highlightFirst, fitted.variant);
        assert.ok(
          Number.isInteger(number) && number >= 1 && number <= total,
          `${tone}/${highlightFirst ? "destaque" : "apoio"} · "${highlight}" → slide ${number} (total ${total})`,
        );
      }
    }
  }
});

test("uma variação desconhecida cai na última aprovada, nunca fora do arquivo", () => {
  assert.equal(masterSlideNumber("blue", false, "longCopy"), 11);
  assert.equal(masterSlideNumber("green", true, "longCopy"), 6);
  assert.equal(masterSlideNumber("blue", false, 99), 11);
});
