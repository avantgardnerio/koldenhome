import { html } from "htm/preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../app.js";

const STRATEGIES = [
  { value: 0, label: "Default" },
  { value: 2, label: "Insecure" },
  { value: 3, label: "S0 Legacy" },
  { value: 4, label: "S2" },
];

export function Controller() {
  const [nodes, setNodes] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // "including" | "excluding" | null
  const [strategy, setStrategy] = useState(0);

  const load = useCallback(async () => {
    try {
      setNodes(await api.get("/nodes"));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startInclusion() {
    try {
      await api.post("/controller/inclusion/start", { strategy });
      setMode("including");
    } catch (e) { setError(e.message); }
  }

  async function startExclusion() {
    try {
      await api.post("/controller/exclusion/start", { strategy: 0 });
      setMode("excluding");
    } catch (e) { setError(e.message); }
  }

  async function stop() {
    try {
      if (mode === "including") await api.post("/controller/inclusion/stop");
      else await api.post("/controller/exclusion/stop");
      setMode(null);
      load();
    } catch (e) { setError(e.message); }
  }

  if (!nodes && !error) return html`<div class="loading">Loading nodes...</div>`;

  return html`
    <div class="controller">
      <h1>Controller</h1>

      ${error && html`<div class="error">${error}</div>`}

      ${mode && html`
        <div class="status-bar">
          <span class="pulse"></span>
          <span>${mode === "including" ? "Inclusion" : "Exclusion"} mode active — activate device now</span>
          <button onClick=${stop}>Stop</button>
        </div>
      `}

      <div class="toolbar">
        <select value=${strategy} onChange=${(e) => setStrategy(Number(e.target.value))}>
          ${STRATEGIES.map((s) => html`<option value=${s.value}>${s.label}</option>`)}
        </select>
        <button class="primary" onClick=${startInclusion} disabled=${!!mode}>Include</button>
        <button onClick=${startExclusion} disabled=${!!mode}>Exclude</button>
        <button onClick=${load}>Refresh</button>
      </div>

      ${nodes && html`
        <div class="card">
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Location</th><th>Status</th><th>Ready</th></tr>
            </thead>
            <tbody>
              ${nodes.map((n) => html`
                <tr class="device-row" onClick=${() => navigate("/nodes/" + n.id)}>
                  <td>${n.id}</td>
                  <td>${n.name || "—"}</td>
                  <td>${n.location || "—"}</td>
                  <td><span class="badge">${n.status}</span></td>
                  <td><span class="badge ${n.ready ? "ready" : ""}">${n.ready ? "Yes" : "No"}</span></td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
