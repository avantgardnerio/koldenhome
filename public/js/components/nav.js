import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { navigate } from "../app.js";
import { onServerTime, getLastServerTime } from "../api.js";

function link(e, path) {
  e.preventDefault();
  navigate(path);
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.dispatchEvent(new CustomEvent("auth"));
}

function fmt(d) {
  return d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "--:--";
}

export function Nav({ path, auth, installPrompt }) {
  const [time, setTime] = useState(fmt(getLastServerTime()));
  useEffect(() => onServerTime((t) => setTime(fmt(t))), []);
  return html`
    <nav class="nav">
      <span class="nav-clock">${time}</span>
      <a href="/" class=${path === "/" ? "active" : ""} onClick=${(e) => link(e, "/")}>Dashboard</a>
      <a href="/controller" class=${path === "/controller" ? "active" : ""} onClick=${(e) => link(e, "/controller")}>Controller</a>
      <span class="nav-spacer" />
      ${installPrompt?.canInstall
        ? html`<button class="nav-install" onClick=${installPrompt.install}>Install</button>`
        : null
      }
      ${auth.local
        ? html`<span class="nav-badge local">Local</span>`
        : auth.user
          ? html`
              <span class="nav-user">${auth.user.name || auth.user.email}</span>
              <button class="nav-logout" onClick=${logout}>Logout</button>
            `
          : null
      }
    </nav>
  `;
}
