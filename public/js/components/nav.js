import { html } from "htm/preact";
import { navigate } from "../app.js";

function link(e, path) {
  e.preventDefault();
  navigate(path);
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.dispatchEvent(new CustomEvent("auth"));
}

export function Nav({ path, auth, installPrompt }) {
  return html`
    <nav class="nav">
      <span class="brand">KoldenHome</span>
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
