
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "metro_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function sign(value) {
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return first.length === second.length &&
    timingSafeEqual(first, second);
}

function makeCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function getSession(req) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)metro_session=([^;]+)/);

  if (!match) return null;

  const parts = match[1].split(".");
  if (parts.length !== 3) return null;

  const [role, expiry, signature] = parts;

  if (!["admin", "viewer"].includes(role)) return null;
  if (!/^\d+$/.test(expiry)) return null;
  if (Number(expiry) < Date.now()) return null;

  const payload = `${role}.${expiry}`;
  const expected = sign(payload);

  if (!safeEqual(signature, expected)) return null;

  return { role };
}

export default async (req) => {
  if (!process.env.SESSION_SECRET ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.VIEWER_PASSWORD) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  if (req.method === "GET") {
    const session = getSession(req);

    return json({
      loggedIn: Boolean(session),
      role: session?.role || null
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Require requests to originate from this deployed site.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin || !host) {
    return json({ error: "Invalid request origin" }, 403);
  }

  try {
    const originUrl = new URL(origin);

    if (originUrl.host !== host || originUrl.protocol !== "https:") {
      return json({ error: "Invalid request origin" }, 403);
    }
  } catch {
    return json({ error: "Invalid request origin" }, 403);
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return json({ error: "Invalid request" }, 400);
  }

  if (body.action === "logout") {
    return json(
      { success: true },
      200,
      { "Set-Cookie": makeCookie("", 0) }
    );
  }

  if (body.action === "login") {
    const password = String(body.password || "");

    if (password.length < 1 || password.length > 200) {
      return json({ error: "كلمة المرور غير صحيحة" }, 401);
    }

    let role = null;

    if (safeEqual(password, process.env.ADMIN_PASSWORD)) {
      role = "admin";
    } else if (safeEqual(password, process.env.VIEWER_PASSWORD)) {
      role = "viewer";
    }

    if (!role) {
      return json({ error: "كلمة المرور غير صحيحة" }, 401);
    }

    const expiry = String(Date.now() + SESSION_DURATION);
    const payload = `${role}.${expiry}`;
    const token = `${payload}.${sign(payload)}`;

    return json(
      { success: true, role },
      200,
      {
        "Set-Cookie": makeCookie(token, SESSION_DURATION / 1000)
      }
    );
  }

  return json({ error: "Invalid action" }, 400);
};
