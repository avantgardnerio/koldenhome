import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { navigate } from "../app.js";
import { onServerTime, getLastServerTime, getAppVersion } from "../api.js";

function link(e, path) {
  e.preventDefault();
  navigate(path);
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.dispatchEvent(new CustomEvent("auth"));
}

function fmt(d) {
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--";
}

export function Nav({ path, auth, installPrompt }) {
  const [time, setTime] = useState(fmt(getLastServerTime()));
  useEffect(() => onServerTime((t) => setTime(fmt(t))), []);
  return html`
    <nav class="nav">
      <span class="nav-clock">${time} <span class="nav-version">${getAppVersion()}</span></span>
      <a href="/" class=${path === "/" ? "active" : ""} onClick=${(e) => link(e, "/")}>Dashboard</a>
      <a href="/battery" class=${path === "/battery" ? "active" : ""} onClick=${(e) => link(e, "/battery")}>Battery</a>
      <a href="/cameras" class=${path === "/cameras" ? "active" : ""} onClick=${(e) => link(e, "/cameras")}>Cameras</a>
      ${auth.local && html`<a href="/controller" class=${path === "/controller" ? "active" : ""} onClick=${(e) => link(e, "/controller")}>Controller</a>`}
      <span class="nav-spacer" />
      ${installPrompt?.canInstall
        ? html`<button class="nav-install" onClick=${installPrompt.install}>Install</button>`
        : null
      }
      ${auth.local
        ? html`<span class="nav-badge local">Local</span>`
        : auth.user
          ? html`
              <img class="nav-avatar" src=${auth.user.picture} alt="" onClick=${logout} title="Logout" />
            `
          : null
      }
    </nav>
  `;
}
