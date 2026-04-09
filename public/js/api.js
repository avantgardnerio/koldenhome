let lastServerTime = null;
let appVersion = null;
const listeners = new Set();

export function onServerTime(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getLastServerTime() { return lastServerTime; }
export function getAppVersion() { return appVersion; }

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch("/api" + path, opts);
  const t = res.headers.get("X-Server-Time");
  if (t) {
    lastServerTime = new Date(t);
    listeners.forEach((fn) => fn(lastServerTime));
  }
  appVersion = res.headers.get("X-App-Version") || appVersion;
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth", { detail: { status: 401 } }));
    throw new Error("Authentication required");
  }
  if (res.status === 403) {
    throw new Error("Localhost access only");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  del: (path) => request("DELETE", path),
};
