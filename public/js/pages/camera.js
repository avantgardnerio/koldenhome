import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { api } from "../api.js";
import { VideoRTC } from "../video-rtc.js";

// Register the custom element once
if (!customElements.get("video-rtc")) {
  customElements.define("video-rtc", class extends VideoRTC {});
}

function signalingUrl(streamId) {
  // Always same-origin: Express proxies /cam/* to go2rtc (supports WS upgrade).
  // LAN hits Express on :3000, WAN goes through Caddy → Express.
  const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${location.host}/cam/api/ws?src=${encodeURIComponent(streamId)}`;
}

function CameraStream({ streamId }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.src = signalingUrl(streamId);
    // LAN (direct to Express :3000): low-latency WebRTC/MSE.
    // WAN (through Caddy): MP4 is slower (~3-5s) but stable across hairpin NAT,
    // variable WiFi, and long proxy chains where MSE tends to stall.
    const isLanDirect = location.port === "3000";
    ref.current.mode = isLanDirect ? "webrtc,mse,mp4" : "mp4";
  }, [streamId]);
  return html`<video-rtc ref=${ref} class="camera-video"></video-rtc>`;
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
        <${CameraStream} streamId=${selected} />
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
