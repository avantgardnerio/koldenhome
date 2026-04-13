import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";

function streamUrl(streamId) {
  // LAN direct: hitting Express on :3000 → go straight to go2rtc on :8084
  // WAN via Caddy: use /cam/ proxy (forward_auth'd, same origin)
  const isLanDirect = location.port === "3000";
  const base = isLanDirect
    ? `http://${location.hostname}:8084`
    : `/cam`;
  return `${base}/api/stream.mp4?src=${encodeURIComponent(streamId)}`;
}

export function Camera() {
  const [cameras, setCameras] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/cameras")
      .then(setCameras)
      .catch((e) => setError(e.message));
  }, []);

  if (selected) {
    const cam = cameras.find((c) => c.streamId === selected);
    return html`
      <div class="camera-page">
        <button class="camera-back" onClick=${() => setSelected(null)}>← Back</button>
        <h1>${cam.name}</h1>
        <video class="camera-video" src=${streamUrl(selected)} autoplay muted playsinline controls></video>
      </div>
    `;
  }

  if (error) return html`<div class="camera-page"><div class="error">${error}</div></div>`;
  if (!cameras) return html`<div class="camera-page"><div class="loading">Loading cameras...</div></div>`;

  return html`
    <div class="camera-page">
      <h1>Cameras</h1>
      ${cameras.length === 0
        ? html`<div class="camera-empty">No cameras configured.</div>`
        : html`
            <div class="camera-list">
              ${cameras.map((c) => html`
                <button class="camera-item" key=${c.streamId} onClick=${() => setSelected(c.streamId)}>
                  ${c.name}
                </button>
              `)}
            </div>
          `}
    </div>
  `;
}
