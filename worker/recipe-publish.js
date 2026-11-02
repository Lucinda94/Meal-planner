/**
 * Cloudflare Worker that writes recipes.csv for the meal planner.
 * The GitHub token and the shared passcode live in Worker secrets, never in the page.
 *
 * Secrets:
 *   GITHUB_TOKEN      Fine-grained token, this repo only, Contents read and write.
 *   RECIPE_PASSCODE   The phrase Lucy types in the app.
 */

export const RECIPE_HEADER = "Recipe,Whose recipe,Ingredients,Optional extras,Method,Notes";

const ALLOWED_ORIGINS = new Set([
  "https://lucinda94.github.io",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
]);

export function safeEqual(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function csvIsPublishable(csv) {
  const text = String(csv || "").replace(/^\uFEFF/, "").trim();
  if (!text || text.length > 500000) return false;
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2 || lines[0].trim() !== RECIPE_HEADER) return false;
  return lines.slice(1).some((line) => {
    const name = line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.split(",")[0];
    return String(name || "").trim() !== "";
  });
}

export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function jsonResponse(body, status, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function preflight(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ ok: false, error: "origin" }, 403, "");
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}

export async function publishRecipes(request, env, fetchImpl = fetch) {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return preflight(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ ok: false, error: "origin" }, 403, "");
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "method" }, 405, origin);

  const token = String(env?.GITHUB_TOKEN || "");
  const expected = String(env?.RECIPE_PASSCODE || "");
  if (!token || !expected) return jsonResponse({ ok: false, error: "not-configured" }, 503, origin);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid" }, 400, origin);
  }
  const passcode = String(payload?.passcode || "");
  const csv = String(payload?.csv || "");
  if (!passcode || !safeEqual(passcode, expected)) return jsonResponse({ ok: false, error: "passcode" }, 401, origin);
  if (!csvIsPublishable(csv)) return jsonResponse({ ok: false, error: "invalid" }, 400, origin);

  const repo = env.GITHUB_REPO || "Lucinda94/Meal-planner";
  const branch = env.GITHUB_BRANCH || "main";
  const path = env.RECIPE_PATH || "recipes.csv";
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "meal-planner",
    "x-github-api-version": "2022-11-28",
  };

  const current = await fetchImpl(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!current.ok && current.status !== 404) return jsonResponse({ ok: false, error: "github" }, 502, origin);
  const currentBody = current.status === 404 ? {} : await current.json();
  const put = await fetchImpl(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "Update recipes from the meal planner",
      content: utf8ToBase64(csv.endsWith("\n") ? csv : `${csv}\n`),
      sha: currentBody.sha,
      branch,
    }),
  });
  if (put.status === 409) return jsonResponse({ ok: false, error: "conflict" }, 409, origin);
  if (!put.ok) return jsonResponse({ ok: false, error: "github" }, 502, origin);
  const saved = await put.json();
  return jsonResponse({ ok: true, commit: saved.commit?.sha || "" }, 200, origin);
}

export default {
  fetch(request, env) {
    return publishRecipes(request, env, fetch);
  },
};
