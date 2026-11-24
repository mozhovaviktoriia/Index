function jsonResponse(data, status, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status: status, headers: headers });
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function decodeTicket(ticket) {
  const base64 = ticket.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function telegramRequest(env, method, payload) {
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    return { ok: false, error: result.description || "Telegram API request failed." };
  }
  return { ok: true, result: result };
}

async function handleSetup(request, env, origin) {
  if (!env.WORKER_ADMIN_SECRET || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return jsonResponse({ ok: false, error: "Worker secrets are not fully configured." }, 500, origin);
  }
  const body = await request.json();
  if (!constantTimeEqual(String(body.admin_secret || ""), env.WORKER_ADMIN_SECRET)) {
    return jsonResponse({ ok: false, error: "Worker setup secret does not match." }, 403, origin);
  }
  if (!env.TELEGRAM_WEBHOOK_URL) {
    return jsonResponse({ ok: false, error: "Set TELEGRAM_WEBHOOK_URL in Worker variables first." }, 500, origin);
  }

  if (!/^https:\/\/[^\s]+$/i.test(env.TELEGRAM_WEBHOOK_URL)) {
    return jsonResponse({ ok: false, error: "TELEGRAM_WEBHOOK_URL must be an HTTPS URL." }, 500, origin);
  }
  const result = await telegramRequest(env, "setWebhook", {
    url: env.TELEGRAM_WEBHOOK_URL,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"]
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 502, origin);
  const info = await telegramRequest(env, "getWebhookInfo", {});
  if (!info.ok) return jsonResponse({ ok: false, error: info.error }, 502, origin);
  return jsonResponse({ ok: true, webhook_info: info.result }, 200, origin);
}

async function handleNotification(request, env, origin) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_RELAY_SECRET) {
    return jsonResponse({ ok: false, error: "Worker notification secrets are not configured." }, 500, origin);
  }
  const body = await request.json();
  const ticket = String(body.ticket || "");
  const signature = String(body.signature || "");
  const expected = await hmacHex(env.TELEGRAM_RELAY_SECRET, ticket);
  if (!constantTimeEqual(signature, expected)) {
    return jsonResponse({ ok: false, error: "Notification signature is invalid." }, 403, origin);
  }

  let payload;
  try {
    payload = decodeTicket(ticket);
  } catch {
    return jsonResponse({ ok: false, error: "Notification ticket is invalid." }, 400, origin);
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    !payload.chat_id
    || !payload.text
    || !payload.nonce
    || !Number.isInteger(payload.expires_at)
    || payload.expires_at < now
    || payload.expires_at > now + 300
  ) {
    return jsonResponse({ ok: false, error: "Notification ticket has expired or is incomplete." }, 400, origin);
  }

  const cacheKey = new Request(urlForNonce(request.url, payload.nonce));
  const cache = caches.default;
  if (await cache.match(cacheKey)) {
    return jsonResponse({ ok: false, error: "This notification was already sent." }, 409, origin);
  }
  const result = await telegramRequest(env, "sendMessage", {
    chat_id: String(payload.chat_id),
    text: String(payload.text)
  });
  if (!result.ok) {
    await cache.delete(cacheKey);
    return jsonResponse({ ok: false, error: result.error }, 502, origin);
  }
  await cache.put(cacheKey, new Response("sent"), {
    expirationTtl: Math.max(1, payload.expires_at - now)
  });
  return jsonResponse({ ok: true }, 200, origin);
}

function urlForNonce(requestUrl, nonce) {
  return new URL("/__notification/" + encodeURIComponent(nonce), requestUrl).toString();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
      return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, null);
    }
    if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);
    if (request.method !== "POST") return jsonResponse({ ok: false }, 405, origin);
    if (url.pathname === "/setup") return handleSetup(request, env, origin);
    if (url.pathname === "/notify") return handleNotification(request, env, origin);
    return jsonResponse({ ok: false, error: "Not found." }, 404, origin);
  }
};
