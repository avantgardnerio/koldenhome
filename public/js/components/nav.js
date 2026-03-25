import { html } from "htm/preact";
import { navigate } from "../app.js";

function link(e, path) {
  e.preventDefault();
  navigate(path);
}

export function Nav({ path }) {
  return html`
    <nav class="nav">
      <span class="brand">KoldenHome</span>
      <a href="/" class=${path === "/" ? "active" : ""} onClick=${(e) => link(e, "/")}>Dashboard</a>
      <a href="/controller" class=${path === "/controller" ? "active" : ""} onClick=${(e) => link(e, "/controller")}>Controller</a>
    </nav>
  `;
}
