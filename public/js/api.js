export const API = "";
export const TOKEN_KEY = "ecs_jwt";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, opts = {}) {
  const { skipAuth, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const token = skipAuth === true ? "" : getToken();
    const r = await fetch(API + path, {
      ...fetchOpts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOpts.headers || {}),
      },
      body: fetchOpts.body != null ? JSON.stringify(fetchOpts.body) : undefined,
      signal: controller.signal,
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (r.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent("ecs-unauthorized"));
      throw new Error(data?.error || "פג תוקף הכניסה — יש להתחבר מחדש.");
    }
    if (!r.ok) throw new Error(data?.error || r.statusText);
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("הבקשה לקחה יותר מדי זמן — בדוק חיבור לאינטרנט.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch binary (e.g. PDF) with auth. */
export async function apiBlob(path, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const token = getToken();
    const r = await fetch(API + path, {
      ...opts,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.headers || {}),
      },
      signal: controller.signal,
    });
    if (r.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent("ecs-unauthorized"));
      throw new Error("פג תוקף הכניסה — יש להתחבר מחדש.");
    }
    if (!r.ok) {
      const t = await r.text();
      let err = t;
      try {
        err = JSON.parse(t).error || t;
      } catch {
        /* plain text */
      }
      throw new Error(err || r.statusText);
    }
    return await r.blob();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("הבקשה לקחה יותר מדי זמן.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
