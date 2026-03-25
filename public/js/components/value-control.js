import { html } from "htm/preact";
import { useState } from "preact/hooks";

export function ValueControl({ value, metadata, onSet }) {
  const [pending, setPending] = useState(value);
  const writeable = metadata.writeable !== false;
  const type = metadata.type;
  const states = metadata.states;

  if (!writeable) {
    if (states && states[String(value)] !== undefined) return html`<span>${states[String(value)]}</span>`;
    if (typeof value === "boolean") return html`<span>${value ? "true" : "false"}</span>`;
    return html`<span>${value ?? "—"}</span>`;
  }

  // Boolean → checkbox
  if (type === "boolean") {
    return html`
      <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">
        <input type="checkbox"
          checked=${pending}
          onChange=${(e) => { setPending(e.target.checked); onSet(e.target.checked); }}
        />
        ${pending ? "true" : "false"}
      </label>
    `;
  }

  // Number with states → dropdown
  if (states && Object.keys(states).length > 0) {
    return html`
      <select value=${String(pending ?? "")} onChange=${(e) => setPending(Number(e.target.value))}>
        ${Object.entries(states).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
      </select>
      <button onClick=${() => onSet(Number(pending))}>Set</button>
    `;
  }

  // Number with min/max
  if (type === "number") {
    return html`
      <input type="number"
        value=${pending ?? ""}
        min=${metadata.min}
        max=${metadata.max}
        step=${metadata.step ?? 1}
        onChange=${(e) => setPending(Number(e.target.value))}
      />
      <button onClick=${() => onSet(Number(pending))}>Set</button>
    `;
  }

  // String → text input
  return html`
    <input type="text"
      value=${pending ?? ""}
      onChange=${(e) => setPending(e.target.value)}
    />
    <button onClick=${() => onSet(pending)}>Set</button>
  `;
}
