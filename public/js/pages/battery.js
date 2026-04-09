import { html } from "htm/preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "../api.js";

function levelColor(level) {
  if (level == null) return "var(--text-muted)";
  if (level >= 50) return "var(--color-green, #4caf50)";
  if (level >= 20) return "var(--color-yellow, #ff9800)";
  return "var(--color-red, #f44336)";
}

function timeAgo(ts) {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Battery() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get("/battery"));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!items && !error) return html`<div class="loading">Loading battery status...</div>`;

  return html`
    <div class="battery-page">
      <h1>Battery Status</h1>
      ${error && html`<div class="error">${error}</div>`}
      ${items && items.length === 0 && html`
        <div class="battery-empty">No battery-powered devices found.</div>
      `}
      ${items && items.length > 0 && html`
        <div class="battery-list">
          ${items.map((d) => html`
            <div class="battery-card" key=${d.nodeId}>
              <div class="battery-name">${d.name}</div>
              <div class="battery-level" style=${{ color: levelColor(d.level) }}>
                ${d.level != null ? `${d.level}%` : "Unknown"}
              </div>
              <div class="battery-meta">
                ${d.isLow && html`<span class="battery-low">LOW</span>`}
                <span class="battery-seen">${timeAgo(d.lastSeen)}</span>
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
