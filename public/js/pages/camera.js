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
  // LAN (direct to Express :3000): use video-rtc for low-latency WebRTC/MSE.
  // WAN (through Caddy): use a plain <video> pointed at go2rtc's HTTP MP4
  // endpoint. Higher latency (~5-8s) but rock stable across hairpin NAT,
  // variable WiFi, and on mobile browsers where MSE tends to stall.
  const isLanDirect = location.port === "3000";
  const rtcRef = useRef(null);

  useEffect(() => {
    if (!isLanDirect || !rtcRef.current) return;
    rtcRef.current.src = signalingUrl(streamId);
    rtcRef.current.mode = "webrtc,mse,mp4";
  }, [streamId, isLanDirect]);

  if (isLanDirect) {
    return html`<video-rtc ref=${rtcRef} class="camera-video"></video-rtc>`;
  }
  const mp4Src = `/cam/api/stream.mp4?src=${encodeURIComponent(streamId)}`;
  return html`<video class="camera-video" src=${mp4Src} autoplay muted playsinline controls></video>`;
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
