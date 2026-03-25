import { html } from "htm/preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "../api.js";
import { ValueControl } from "../components/value-control.js";

export function Dashboard() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  // Add-item form state
  const [nodes, setNodes] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [nodeValues, setNodeValues] = useState(null);
  const [selectedValueIdx, setSelectedValueIdx] = useState("");
  const [addLabel, setAddLabel] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get("/dashboard");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setValue(item, newValue) {
    try {
      await api.post(`/nodes/${item.node_id}/values/set`, {
        commandClass: item.command_class,
        property: item.property,
        propertyKey: item.property_key ?? undefined,
        endpoint: item.endpoint ?? undefined,
        value: newValue,
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeItem(id) {
    try {
      await api.del(`/dashboard/${id}`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleEdit() {
    const next = !editing;
    setEditing(next);
    if (next && !nodes) {
      try {
        const data = await api.get("/nodes");
        setNodes(data);
      } catch (e) {
        setError(e.message);
      }
    }
  }

  async function onSelectNode(e) {
    const nodeId = e.target.value;
    setSelectedNodeId(nodeId);
    setNodeValues(null);
    setSelectedValueIdx("");
    setAddLabel("");
    if (!nodeId) return;
    try {
      const vals = await api.get(`/nodes/${nodeId}/values`);
      setNodeValues(vals);
    } catch (err) {
      setError(err.message);
    }
  }

  function onSelectValue(e) {
    const idx = e.target.value;
    setSelectedValueIdx(idx);
    if (idx !== "" && nodeValues[idx]) {
      const v = nodeValues[idx];
      setAddLabel(v.metadata?.label || v.propertyName || v.property);
    }
  }

  async function addItem() {
    if (!selectedNodeId || selectedValueIdx === "" || !addLabel) return;
    const v = nodeValues[selectedValueIdx];
    try {
      await api.post("/dashboard", {
        node_id: Number(selectedNodeId),
        label: addLabel,
        command_class: v.commandClass,
        property: v.property,
        property_key: v.propertyKey ?? null,
        endpoint: v.endpoint ?? null,
      });
      setSelectedNodeId("");
      setNodeValues(null);
      setSelectedValueIdx("");
      setAddLabel("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!items && !error) return html`<div class="loading">Loading dashboard...</div>`;

  return html`
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>Dashboard</h1>
        <button onClick=${toggleEdit}>${editing ? "Done" : "Edit"}</button>
      </div>

      ${error && html`<div class="error">${error}</div>`}

      ${items && items.length === 0 && !editing && html`
        <div class="dashboard-empty">
          No quick actions configured. Click Edit to add items.
        </div>
      `}

      ${items && items.length > 0 && html`
        <div class="dashboard-grid">
          ${items.map((item) => html`
            <div class="dashboard-card" key=${item.id}>
              <div class="card-label">${item.label}</div>
              <div class="card-control">
                ${item.metadata
                  ? html`<${ValueControl}
                      value=${item.value}
                      metadata=${item.metadata}
                      onSet=${(v) => setValue(item, v)}
                    />`
                  : html`<span style="color:var(--text-muted)">Node ${item.node_id} unavailable</span>`
                }
              </div>
              ${editing && html`
                <button class="card-remove" onClick=${() => removeItem(item.id)}>Remove</button>
              `}
            </div>
          `)}
        </div>
      `}

      ${editing && html`
        <div class="dashboard-add">
          <h3>Add Item</h3>
          <div class="add-row">
            <label>Node</label>
            <select value=${selectedNodeId} onChange=${onSelectNode}>
              <option value="">Select node...</option>
              ${nodes && nodes.map((n) => html`
                <option value=${n.id}>${n.name || `Node ${n.id}`}</option>
              `)}
            </select>
          </div>
          ${nodeValues && html`
            <div class="add-row">
              <label>Value</label>
              <select value=${selectedValueIdx} onChange=${onSelectValue}>
                <option value="">Select value...</option>
                ${nodeValues.map((v, i) => html`
                  <option value=${i}>
                    ${v.metadata?.label || v.propertyName || v.property}
                    ${` (CC ${v.commandClass})`}
                  </option>
                `)}
              </select>
            </div>
            <div class="add-row">
              <label>Label</label>
              <input value=${addLabel} onInput=${(e) => setAddLabel(e.target.value)} placeholder="Display name" />
            </div>
            <button class="primary" onClick=${addItem} disabled=${!addLabel || selectedValueIdx === ""}>
              Add to Dashboard
            </button>
          `}
        </div>
      `}
    </div>
  `;
}
