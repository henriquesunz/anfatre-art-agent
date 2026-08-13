# ANFATRE Art Agent

Painel de produção de posts da ANFATRE RV. O fluxo atual recebe um briefing, escolhe um dos seis layouts aprovados, monta um PPTX 4:5 com textos editáveis e importa o resultado na conta Canva conectada.

## Fluxo disponível

1. acesso protegido por uma senha interna;
2. briefing em linguagem comum;
3. escolha automática ou manual entre seis layouts oficiais;
4. planejamento de copy e geração de fotografia pela OpenAI API, quando configurada;
5. modo de teste com copy direta e fotos aprovadas, quando a IA não está configurada;
6. montagem do post em Montserrat e importação pela Canva Design Import API;
7. link direto para revisão no editor do Canva e legenda pronta para copiar.

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha `CANVA_CLIENT_SECRET`. Nunca envie esse valor por chat nem faça commit do arquivo.
3. Cadastre no Canva Developers:

   `http://127.0.0.1:3001/api/canva/callback`

4. Opcionalmente preencha:
   - `AGENT_ACCESS_PASSWORD`: senha compartilhada de acesso ao painel;
   - `OPENAI_API_KEY`: habilita planejamento de copy e geração de fotografia;
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
