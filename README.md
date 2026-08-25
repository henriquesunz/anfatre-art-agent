# ANFATRE Art Agent

Painel de produção de posts da ANFATRE RV. A social cola um post ou a pauta inteira no formato que já usa hoje; o agente separa os conteúdos, apresenta uma conferência e importa as artes editáveis na conta Canva conectada.

## Fluxo disponível

1. acesso protegido por uma senha interna;
2. uma única caixa para colar a pauta completa;
3. identificação automática de título, subtítulo, data opcional, formato e marcações `TELA 1`, `TELA 2` etc.;
4. conferência dos posts encontrados e alertas de inconsistência, como um título que promete cinco itens e detalha apenas quatro;
5. seleção das artes que devem ser criadas;
6. escolha inteligente do modelo e geração de fotografia pela OpenAI API, sem reescrever a copy recebida;
7. modo de teste com o mesmo texto original e fotos aprovadas, quando a IA não está configurada;
8. montagem em Montserrat e importação pela Canva Design Import API;
9. um design por post selecionado; carrosséis são entregues com todas as páginas no mesmo editável;
10. links diretos para revisão no Canva e legendas prontas para copiar.

Os posts de uma página são montados diretamente a partir de
`fixtures/anfatre-production-master.pptx`. O gerador escolhe uma das variações
aprovadas, mantém somente esse slide, preenche os marcadores editáveis e troca a
fotografia com corte `cover` quando uma nova imagem é gerada. Carrosséis com
páginas internas continuam usando o construtor atual; o mestre fornece a capa.

## Escolha do modelo e artes agrupadas

Na conferência do briefing cada post tem um seletor de modelo. O padrão é **O agente
escolhe**; qualquer outra opção passa por cima da decisão automática. Carrosséis com
várias TELAS ficam travados em `carousel`, porque o modelo vem do próprio briefing.

Ao criar, os posts selecionados viram **um único arquivo no Google Slides**, um bloco
de slides por post, na ordem em que aparecem na conferência — um carrossel contribui
com todas as suas telas. As capas fotográficas nascem de duplicatas dos slides
aprovados do mestre (`duplicateObject` com ids previsíveis); os demais layouts são
desenhados do zero na mesma apresentação. No fim os slides originais do mestre são
apagados e a ordem é reaplicada.

O Canva ainda entrega **um arquivo por post**: o agrupamento foi feito só no Google
Slides, que é o destino principal. O botão de criar diz qual dos dois vai acontecer.

## Carrosséis

Uma pauta vira carrossel quando traz `TELA 1:`, `TELA 2:` … A **TELA 1 é a capa** e as
demais viram as páginas internas; a última ganha o layout de fechamento quando o texto
tem *comente*, *salve*, *compartilhe*, *acesse*, *saiba mais* ou *próxima parada*.
Quatro TELAS = quatro slides, e no arquivo agrupado elas entram em sequência junto dos
outros posts.

As TELAS são procuradas primeiro dentro do campo Título — o formato de sempre — e, só
quando não há carrossel ali, no bloco inteiro. Isso cobre as pautas que listam as TELAS
depois da seção "Tamanho da Arte" ou sem campo Título nenhum, que antes viravam post
único sem qualquer aviso. Quando existe um campo Título separado que não entra na arte,
a conferência mostra um alerta em vez de descartá-lo calado.

Nas páginas internas o título é medido e reequilibrado como nas capas; o corpo **não é
requebrado** — parágrafo é leitura, não manchete —, apenas reduz de corpo até caber.

## Encaixe do texto

O servidor não tem a Montserrat instalada, então `lib/montserrat-metrics.mjs`
carrega as larguras reais de cada glifo (extraídas das tabelas `hmtx`/`hhea` dos
arquivos Regular, Bold e ExtraBold). Todo o encaixe de texto sai dessas medidas:

- a variação do mestre é escolhida medindo o texto nas caixas reais, e vence a
  primeira em que ele cabe inteiro sem reduzir a fonte;
- a quebra de linha é decidida aqui e gravada explicitamente (`<a:br/>` no PPTX,
  `\n` no Slides), em vez de ficar a cargo de quem abre o arquivo;
- a altura da caixa é recalculada e o bloco é recentralizado no painel colorido,
  o que dispensa o `spAutoFit` do mestre — ele vira `<a:noAutofit/>`;
- quando nenhuma variação comporta a copy, o corpo é reduzido até 62% do
  desenhado antes de qualquer texto vazar.

Isso vale para as três entregas (PPTX do mestre, Google Slides e a cópia do deck
mestre no Drive), de modo que as três produzem a mesma arte.

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha `CANVA_CLIENT_SECRET`. Nunca envie esse valor por chat nem faça commit do arquivo.
3. Cadastre no Canva Developers:

   `http://127.0.0.1:3001/api/canva/callback`

4. Opcionalmente preencha:
   - `AGENT_ACCESS_PASSWORD`: senha compartilhada de acesso ao painel;
   - `OPENAI_API_KEY`: habilita escolha inteligente do modelo e geração de fotografia;
   - `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL` e `OPENAI_IMAGE_QUALITY`: permitem trocar os modelos sem alterar o código.
5. Execute `npm install` e `npm run dev`.
6. Abra `http://127.0.0.1:3001`.

## Variáveis no Render

Já configuradas pelo `render.yaml`:

- `NODE_VERSION`
- `NODE_ENV`
- `APP_HOST`
- `COOKIE_SECURE`
- `CANVA_CLIENT_ID`

Devem ser adicionadas manualmente em **Environment**:

- `CANVA_CLIENT_SECRET`
- `CANVA_REDIRECT_URI=https://anfatre-art-agent.onrender.com/api/canva/callback`
- `AGENT_ACCESS_PASSWORD`
- `OPENAI_API_KEY` — opcional enquanto o modo de teste estiver sendo validado
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` — habilitam a entrega no Google Slides (recomendado: fontes 100% fiéis)
- `GOOGLE_REDIRECT_URI=https://anfatre-art-agent.onrender.com/api/google/callback`

## Entrega no Google Slides

Quando uma conta Google está conectada, as artes são criadas direto como apresentações
editáveis no Google Slides (página 4:5, 720×900 pt), com Montserrat/Montserrat ExtraBold
nativos — sem conversão de arquivo, eliminando as discrepâncias de fonte do import no Canva.
O Canva continua funcionando como destino alternativo quando o Google não está conectado.

Configuração no Google Cloud Console (<https://console.cloud.google.com>):

1. Crie um projeto e ative as APIs **Google Slides API** e **Google Drive API**.
2. Em *APIs & Services → OAuth consent screen*, configure o app (tipo External, modo de teste
   é suficiente; adicione o e-mail da conta que será conectada como test user).
3. Em *Credentials → Create credentials → OAuth client ID* (tipo Web application), cadastre
   os redirect URIs local e de produção listados acima.
4. Copie o Client ID e o Client Secret para as variáveis de ambiente.

Depois de alterar variáveis, faça um novo deploy. A URL de produção também precisa estar cadastrada como redirect URL padrão no Canva Developers.

## Escopos Canva

- `design:content:write`
- `design:meta:read`
- `profile:read`

## Segurança e limitações desta fase

- Chaves, Client Secret e tokens ficam somente no backend.
- O cookie de acesso é `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- O agente não aceita upload de imagens nesta fase; isso evita que formatos não confiáveis sejam processados no servidor.
- A conexão compartilhada do Canva e o histórico dos trabalhos ainda ficam em memória. Eles somem quando o Render reinicia ou adormece.
- O plano gratuito do Render é indicado para homologação, não para a operação diária definitiva.

Próxima etapa de robustez: banco de dados, refresh token criptografado, usuários individuais, histórico persistente e fila de geração durável.

## Referência da integração de imagens

A geração segue a documentação oficial da OpenAI para a Image API: <https://developers.openai.com/api/docs/guides/image-generation>.
