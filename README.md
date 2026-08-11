# ANFATRE Art Agent — prova da importação Canva

Este protótipo valida o caminho mais importante do produto:

1. conectar uma conta Canva por OAuth 2.0 + PKCE;
2. enviar um PPTX editável da ANFATRE pela Design Import API;
3. receber o link `Editar no Canva`.

O projeto antigo na raiz não é alterado.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Preencha `CANVA_CLIENT_SECRET` localmente. Nunca envie esse valor por chat nem faça commit do arquivo.
3. Confirme no Canva Developers que a redirect URL é exatamente:

   `http://127.0.0.1:3001/api/canva/callback`

4. Execute `npm run dev`.
5. Abra `http://127.0.0.1:3001`.

## Escopos Canva

- `design:content:write`
- `design:meta:read`
- `profile:read`

## Segurança do protótipo

- Client Secret e tokens ficam somente no backend.
- Tokens permanecem apenas em memória e somem ao reiniciar o servidor.
- O protótipo escuta apenas em `127.0.0.1`.
- O cookie de sessão é `HttpOnly` e `SameSite=Lax`.

Antes de produção serão necessários banco, criptografia de refresh tokens, autenticação dos funcionários, logs e revisão da integração pelo Canva.

## Publicação de teste no Render

O projeto inclui `render.yaml` e está preparado para receber a porta dinâmica da plataforma.

1. Publique esta pasta em um repositório privado.
2. No Render, crie um Web Service ou Blueprint a partir do repositório.
3. Aguarde o primeiro deploy e copie o endereço `https://<servico>.onrender.com`.
4. Configure no Render, em Environment:
   - `CANVA_CLIENT_SECRET`: o Client Secret da integração;
   - `CANVA_REDIRECT_URI`: `https://<servico>.onrender.com/api/canva/callback`.
5. Cadastre exatamente a mesma URL em Authentication no Canva Developers.
6. Faça um novo deploy e teste o OAuth.

O plano gratuito é adequado apenas para homologação: ele pode adormecer por inatividade e os tokens atuais ficam somente em memória. Antes do uso diário pelo time, adicione persistência segura e use uma instância que permaneça ativa.
