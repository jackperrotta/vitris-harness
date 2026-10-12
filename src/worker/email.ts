import type { Env } from "./env.ts";
import {
  findAuthorizedSender,
  insertUpdateJob,
  parseSlugFromRecipient,
  parseSlugFromSubject,
} from "./jobs.ts";

/** Minimal MIME parse for subject/text/attachments without heavy deps. */
export async function parseRawEmail(raw: ReadableStream | string): Promise<{
  subject: string;
  text: string;
  fromHeader: string;
  attachments: Array<{ filename: string; contentType: string; bytes: Uint8Array }>;
}> {
  const buf =
    typeof raw === "string"
      ? new TextEncoder().encode(raw)
      : new Uint8Array(await new Response(raw).arrayBuffer());
  const source = new TextDecoder("utf-8").decode(buf);

  const headerEnd = source.search(/\r?\n\r?\n/);
  const headerBlock = headerEnd === -1 ? source : source.slice(0, headerEnd);
  const bodyBlock = headerEnd === -1 ? "" : source.slice(headerEnd).replace(/^\r?\n\r?\n/, "");

  const headers = parseHeaders(headerBlock);
  const subject = decodeMimeWords(headers.subject || "");
  const fromHeader = headers.from || "";
  const contentType = headers["content-type"] || "text/plain";

  if (/multipart\//i.test(contentType)) {
    const boundary = /boundary="?([^";\s]+)"?/i.exec(contentType)?.[1];
    if (boundary) {
      return parseMultipart(bodyBlock, boundary, subject, fromHeader);
    }
  }

  let text = bodyBlock;
  if (/base64/i.test(headers["content-transfer-encoding"] || "")) {
    text = new TextDecoder().decode(base64ToBytes(bodyBlock.replace(/\s+/g, "")));
  } else if (/quoted-printable/i.test(headers["content-transfer-encoding"] || "")) {
    text = decodeQuotedPrintable(bodyBlock);
  }
  if (/text\/html/i.test(contentType)) {
    text = htmlToText(text);
  }

  return { subject, text: text.trim(), fromHeader, attachments: [] };
}

function parseHeaders(block: string): Record<string, string> {
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  const out: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    out[key] = line.slice(idx + 1).trim();
  }
  return out;
}

function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_m, _cs, enc, data) => {
    if (String(enc).toUpperCase() === "B") {
      return new TextDecoder().decode(base64ToBytes(data));
    }
    return decodeQuotedPrintable(String(data).replace(/_/g, " "));
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeQuotedPrintable(input: string): string {
  const soft = input.replace(/=\r?\n/g, "");
  return soft.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseMultipart(
  body: string,
  boundary: string,
  subject: string,
  fromHeader: string,
): {
  subject: string;
  text: string;
  fromHeader: string;
  attachments: Array<{ filename: string; contentType: string; bytes: Uint8Array }>;
} {
  const parts = body.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?`)).slice(1);
  let text = "";
  const attachments: Array<{ filename: string; contentType: string; bytes: Uint8Array }> = [];

  for (const part of parts) {
    if (!part || part.trim() === "--") continue;
    const end = part.search(/\r?\n\r?\n/);
    if (end === -1) continue;
    const ph = parseHeaders(part.slice(0, end));
    const pb = part.slice(end).replace(/^\r?\n\r?\n/, "").replace(/\r?\n$/, "");
    const ct = ph["content-type"] || "text/plain";
    const cd = ph["content-disposition"] || "";
    const filename =
      /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd)?.[1] ||
      /filename="?([^";]+)"?/i.exec(cd)?.[1] ||
      "";

    if (/multipart\//i.test(ct)) {
      const inner = /boundary="?([^";\s]+)"?/i.exec(ct)?.[1];
      if (inner) {
        const nested = parseMultipart(pb, inner, subject, fromHeader);
        if (!text && nested.text) text = nested.text;
        attachments.push(...nested.attachments);
      }
      continue;
    }

    let bytes: Uint8Array;
    if (/base64/i.test(ph["content-transfer-encoding"] || "")) {
      bytes = base64ToBytes(pb.replace(/\s+/g, ""));
    } else {
      const decoded = /quoted-printable/i.test(ph["content-transfer-encoding"] || "")
        ? decodeQuotedPrintable(pb)
        : pb;
      bytes = new TextEncoder().encode(decoded);
    }

    if (filename || /attachment/i.test(cd)) {
      attachments.push({
        filename: decodeURIComponent(filename || `attach-${attachments.length + 1}`),
        contentType: ct.split(";")[0]!.trim(),
        bytes,
      });
    } else if (/text\/plain/i.test(ct) && !text) {
      text = new TextDecoder().decode(bytes);
    } else if (/text\/html/i.test(ct) && !text) {
      text = htmlToText(new TextDecoder().decode(bytes));
    }
  }

  return { subject, text: text.trim(), fromHeader, attachments };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] || from).trim().toLowerCase();
}

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const from = extractEmailAddress(message.from);
  const to = extractEmailAddress(message.to);
  const parsed = await parseRawEmail(message.raw);
  const senderEmail = extractEmailAddress(parsed.fromHeader || from);

  const slug =
    parseSlugFromRecipient(to) ||
    parseSlugFromSubject(parsed.subject) ||
    parseSlugFromSubject(parsed.text.slice(0, 200));

  const auth = await findAuthorizedSender(env, senderEmail, slug);
  if (!auth) {
    message.setReject("Unknown sender for Vitris site updates");
    return;
  }

  const prompt = [parsed.subject ? `Subject: ${parsed.subject}` : "", parsed.text]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!prompt) {
    message.setReject("Empty update request");
    return;
  }

  const jobId = crypto.randomUUID();
  const mediaPrefix = `sites/${auth.tenant.slug}/jobs/${jobId}`;
  const mediaKeys: string[] = [];

  for (const [i, att] of parsed.attachments.entries()) {
    if (!/^image\//i.test(att.contentType) && att.bytes.byteLength > 8_000_000) continue;
    const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || `file-${i}`;
    const key = `${mediaPrefix}/${safeName}`;
    await env.R2.put(key, att.bytes, {
      httpMetadata: { contentType: att.contentType || "application/octet-stream" },
    });
    mediaKeys.push(key);
  }

  await insertUpdateJob(env, {
    id: jobId,
    tenantId: auth.tenant.id,
    senderEmail,
    prompt,
    mediaPrefix: mediaKeys.length ? mediaPrefix : null,
  });
  // Tickets only — operator fulfills in Cursor. Do not spawn SiteUpdateWorkflow.
}
