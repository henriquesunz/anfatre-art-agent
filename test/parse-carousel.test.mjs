import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parsePastedBriefing } from "../lib/parse-briefing.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function shape(items) {
  return items.map((item) => ({
    date: item.date,
    kind: item.kind,
    slideCount: item.slideCount,
    title: item.title,
    subtitle: item.subtitle,
    telas: item.slides.map((slide) => slide.title),
  }));
}

/**
 * Trava do comportamento atual. Estes casos já funcionavam e não podem mudar de
 * resultado — qualquer melhoria na detecção de carrossel entra por baixo deles.
 */
test("a pauta real de agosto continua sendo lida exatamente como antes", async () => {
  const text = await fs.readFile(path.join(rootDir, "test", "fixtures", "briefing-agosto.txt"), "utf8");
  const items = shape(parsePastedBriefing(text));

  assert.deepEqual(items.map((item) => [item.date, item.kind, item.slideCount]), [
    ["11/08", "single", 1],
    ["12/08", "single", 1],
    ["17/08", "single", 1],
    ["21/08", "carousel", 6],
    ["24/08", "single", 1],
    ["28/08", "single", 1],
  ]);

  const carousel = items.find((item) => item.kind === "carousel");
  assert.equal(carousel.title, "Roteiros pelo Brasil:");
  assert.equal(carousel.subtitle, "5 Destinos RV Friendly para Viajar de Motorhome");
  // A TELA 1 é a capa; as demais viram as páginas internas, na ordem do briefing.
  assert.equal(carousel.telas.length, 6);
  assert.match(carousel.telas[1], /Serra Gaúcha/);
  assert.match(carousel.telas.at(-1), /próxima parada/i);
});

test("TELAS dentro do campo Título continuam virando carrossel", () => {
  const [item] = parsePastedBriefing(`25/08 -

1. Título: "
TELA 1: Cinco cuidados antes de pegar a estrada
TELA 2: Calibragem dos pneus
TELA 3: Freios
TELA 4: Comente o que você checa
"

2. Tamanho da Arte:
- Timeline Instagram
`);
  assert.equal(item.kind, "carousel");
  assert.equal(item.slideCount, 4);
  assert.equal(item.title, "Cinco cuidados antes de pegar a estrada");
});

test("TELAS antes da seção de tamanho continuam virando carrossel", () => {
  const [item] = parsePastedBriefing(`25/08 -

1. Título: "Cinco cuidados"

TELA 1: Cinco cuidados
TELA 2: Calibragem
TELA 3: Freios

2. Tamanho da Arte:
- Timeline Instagram
`);
  assert.equal(item.kind, "carousel");
  assert.equal(item.slideCount, 3);
});

test("post único sem TELAS continua post único", () => {
  const [item] = parsePastedBriefing(`11/08 -

1. Título: "Glossário do Caravanista: entenda os termos técnicos de forma simples"

2. Tamanho da Arte:
- Timeline Instagram
`);
  assert.equal(item.kind, "single");
  assert.equal(item.slideCount, 1);
  assert.equal(item.title, "Glossário do Caravanista:");
  assert.equal(item.subtitle, "entenda os termos técnicos de forma simples");
});

// --- formatos que antes viravam post único em silêncio -----------------------

test("TELAS depois da seção de tamanho passam a ser reconhecidas", () => {
  const [item] = parsePastedBriefing(`25/08 -

1. Título: "Cinco cuidados antes de pegar a estrada"

2. Tamanho da Arte:
- Timeline Instagram

TELA 1: Cinco cuidados antes de pegar a estrada
TELA 2: Calibragem dos pneus
TELA 3: Freios
TELA 4: Comente o que você checa
`);
  assert.equal(item.kind, "carousel");
  assert.equal(item.slideCount, 4);
  assert.equal(item.title, "Cinco cuidados antes de pegar a estrada");
  // O campo Título repetia a TELA 1: não há nada a avisar.
  assert.deepEqual(item.warnings, []);
});

test("TELAS sem nenhum campo Título passam a ser reconhecidas", () => {
  const [item] = parsePastedBriefing(`25/08 -

TELA 1: Cinco cuidados antes de pegar a estrada
TELA 2: Calibragem
TELA 3: Freios
`);
  assert.equal(item.kind, "carousel");
  assert.equal(item.slideCount, 3);
  assert.equal(item.title, "Cinco cuidados antes de pegar a estrada");
});

test("um campo Título que não entra na arte vira aviso, não some calado", () => {
  const [item] = parsePastedBriefing(`25/08 -

1. Título: "Guia de viagem 2026"

2. Tamanho da Arte:
- Timeline Instagram

TELA 1: Cinco cuidados antes de pegar a estrada
TELA 2: Calibragem
TELA 3: Freios
`);
  assert.equal(item.kind, "carousel");
  assert.equal(item.title, "Cinco cuidados antes de pegar a estrada");
  assert.equal(item.warnings.length, 1);
  assert.match(item.warnings[0], /fora do campo Título/);
  assert.match(item.warnings[0], /não entra na arte/);
});

test("uma única TELA continua sendo post único", () => {
  const [item] = parsePastedBriefing(`25/08 -

1. Título: "Cinco cuidados"

TELA 1: Cinco cuidados antes de pegar a estrada
`);
  assert.equal(item.kind, "single");
  assert.equal(item.slideCount, 1);
});

test("a palavra TELA sem numeração não cria carrossel", () => {
  const [item] = parsePastedBriefing(`25/08 -

1. Título: "Como limpar a tela do painel do seu motorhome"

2. Tamanho da Arte:
- Timeline Instagram

A tela precisa de pano macio. Tela suja atrapalha a leitura.
`);
  assert.equal(item.kind, "single");
  assert.equal(item.slideCount, 1);
});
