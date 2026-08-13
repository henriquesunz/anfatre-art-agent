import { PAGE, generateSlidesRequests } from "./generate-slides.mjs";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive.file",
];

async function googleFetch(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 60_000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error?.message || `Google API respondeu ${response.status}`);
  return data;
}

async function uploadDriveImage(accessToken, name, buffer, mime) {
  const boundary = `anfatre${Date.now()}${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: `anfatre-tmp-${name}` });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const file = await googleFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    timeout: 120_000,
  });
  // O createImage do Slides precisa conseguir baixar a URL; liberamos leitura por link
  // apenas no arquivo temporário, que é apagado depois que o Slides copia a imagem.
  await googleFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return { id: file.id, url: `https://drive.google.com/uc?export=download&id=${file.id}` };
}

async function deleteDriveFile(accessToken, fileId) {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Arquivo temporário; se a limpeza falhar não compromete o post.
  }
}

export async function deliverToGoogleSlides(accessToken, plan, image, title) {
  const uploaded = [];
  const uploader = async (name, buffer, mime) => {
    const file = await uploadDriveImage(accessToken, name, buffer, mime);
    uploaded.push(file.id);
    return file.url;
  };

  try {
    const requests = await generateSlidesRequests(plan, image, uploader);

    const presentation = await googleFetch(accessToken, "https://slides.googleapis.com/v1/presentations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        pageSize: {
          width: { magnitude: PAGE.width, unit: "PT" },
          height: { magnitude: PAGE.height, unit: "PT" },
        },
      }),
      timeout: 60_000,
    });

    // Remove o slide em branco criado por padrão antes de inserir os nossos.
    const defaultSlideId = presentation.slides?.[0]?.objectId;
    const allRequests = defaultSlideId ? [...requests, { deleteObject: { objectId: defaultSlideId } }] : requests;

    await googleFetch(accessToken, `https://slides.googleapis.com/v1/presentations/${presentation.presentationId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: allRequests }),
      timeout: 120_000,
    });

    return {
      designId: presentation.presentationId,
      title,
      editUrl: `https://docs.google.com/presentation/d/${presentation.presentationId}/edit`,
      viewUrl: `https://docs.google.com/presentation/d/${presentation.presentationId}/preview`,
    };
  } finally {
    for (const fileId of uploaded) await deleteDriveFile(accessToken, fileId);
  }
}
