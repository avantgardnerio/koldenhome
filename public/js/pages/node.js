import { html } from "htm/preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../app.js";
import { ValueControl } from "../components/value-control.js";

export function NodeDetail({ id }) {
  const [node, setNode] = useState(null);
  const [meta, setMeta] = useState(null);
  const [values, setValues] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const [n, m, v] = await Promise.all([
        api.get(`/nodes/${id}`),
        api.get(`/nodes/${id}/metadata`),
        api.get(`/nodes/${id}/values`),
      ]);
      setNode(n);
      setMeta(m);
      setValues(v);
      setEditName(m.name || n.name || "");
      setEditLocation(m.location || n.location || "");
      setEditNotes(m.notes || "");
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveMeta() {
    setSaving(true);
    try {
      const updated = await api.put(`/nodes/${id}/metadata`, {
        name: editName,
        location: editLocation,
        notes: editNotes,
      });
      setMeta(updated);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function setValue(val, newValue) {
    try {
      await api.post(`/nodes/${id}/values/set`, {
        commandClass: val.commandClass,
        property: val.property,
        propertyKey: val.propertyKey,
        endpoint: val.endpoint,
        value: newValue,
      });
      // Refresh values after set
      const v = await api.get(`/nodes/${id}/values`);
      setValues(v);
    } catch (e) { setError(e.message); }
  }

  async function ping() {
    try {
      const r = await api.post(`/nodes/${id}/ping`);
      alert(r.responded ? "Node responded" : "No response");
    } catch (e) { setError(e.message); }
  }

  async function refreshValues() {
    try {
      await api.post(`/nodes/${id}/refresh-values`);
      setTimeout(load, 2000);
    } catch (e) { setError(e.message); }
  }

  async function refreshInfo() {
    try {
      await api.post(`/nodes/${id}/refresh-info`);
    } catch (e) { setError(e.message); }
  }

  if (!node && !error) return html`<div class="loading">Loading node ${id}...</div>`;

  // Group values by command class name
  const grouped = {};
  if (values) {
    for (const v of values) {
      const ccName = v.commandClassName || `CC ${v.commandClass}`;
      if (!grouped[ccName]) grouped[ccName] = [];
      grouped[ccName].push(v);
    }
  }

  return html`
    <div class="node-detail">
      <a href="/controller" class="back-link" onClick=${(e) => { e.preventDefault(); navigate("/controller"); }}>← Controller</a>

      ${error && html`<div class="error">${error}</div>`}

      ${node && html`
        <h1>Node ${node.id}</h1>
        <p class="subtitle">
          ${node.deviceClass?.generic || ""} ${node.deviceClass?.specific || ""}
          ${node.firmwareVersion ? ` — FW ${node.firmwareVersion}` : ""}
          ${" — "}
          <span class="badge ${node.ready ? "ready" : ""}">${node.ready ? "Ready" : node.status}</span>
        </p>

        <div class="card">
          <div class="meta-row">
            <label>Name</label>
            <input value=${editName} onInput=${(e) => setEditName(e.target.value)} />
          </div>
          <div class="meta-row">
            <label>Location</label>
            <input value=${editLocation} onInput=${(e) => setEditLocation(e.target.value)} />
          </div>
          <div class="meta-row">
            <label>Notes</label>
            <input value=${editNotes} onInput=${(e) => setEditNotes(e.target.value)} />
          </div>
          <div class="btn-group" style="margin-top:0.5rem">
            <button class="primary" onClick=${saveMeta} disabled=${saving}>Save Metadata</button>
          </div>
        </div>

        <div class="btn-group">
          <button onClick=${ping}>Ping</button>
          <button onClick=${refreshValues}>Refresh Values</button>
          <button onClick=${refreshInfo}>Refresh Info</button>
          <button onClick=${load}>Reload</button>
        </div>

        <div class="values-section">
          <h2>Values</h2>
          ${Object.entries(grouped).map(([ccName, vals]) => html`
            <div class="card">
              <h3 style="font-size:0.95rem;margin-bottom:0.5rem">${ccName}</h3>
              ${vals.map((v) => html`
                <div class="value-row">
                  <div class="value-label">
                    ${v.metadata?.label || v.propertyName || v.property}
                    ${v.propertyKeyName ? html` <span style="color:var(--text-muted)">(${v.propertyKeyName})</span>` : ""}
                  </div>
                  <div class="value-control">
                    <${ValueControl}
                      value=${v.value}
                      metadata=${v.metadata || {}}
                      onSet=${(newVal) => setValue(v, newVal)}
                    />
                  </div>
                  <div class="value-current">${v.metadata?.unit || ""}</div>
                </div>
              `)}
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
