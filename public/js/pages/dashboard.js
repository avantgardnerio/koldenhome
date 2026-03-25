import { html } from "htm/preact";

export function Dashboard() {
  return html`
    <div class="dashboard">
      <h1>Dashboard</h1>
      <p style="color: var(--text-muted)">Quick actions will go here. Use the Controller page to manage devices.</p>
    </div>
  `;
}
