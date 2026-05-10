import { html } from "htm/preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { api } from "../api.js";
import { Chart, TimeScale, LinearScale, LineController, LineElement, PointElement, BarController, BarElement, Legend, Tooltip, Filler } from "chart.js";
import "chartjs-adapter-date-fns";

Chart.register(TimeScale, LinearScale, LineController, LineElement, PointElement, BarController, BarElement, Legend, Tooltip, Filler);

const COLORS = {
  red: "#e74c3c",
  blue: "#3498db",
  green: "#2ecc71",
  gray: "#95a5a6",
  orange: "#e67e22",
  darkRed: "#c0392b",
  purple: "#8e44ad",
  coolBlue: "#2980b9",
  fanGreen: "#27ae60",
};

function buildDutyBuckets(states, modes, startTime, endTime) {
  if (states.length < 2) return null;
  const buckets = [];
  let hour = new Date(states[0].time);
  hour.setMinutes(0, 0, 0);

  const end = new Date(states[states.length - 1].time);
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);

  const modeAt = (t) => {
    let mode = null;
    for (const m of modes) {
      if (new Date(m.time) <= t) mode = m.value;
      else break;
    }
    return mode;
  };

  while (hour < end) {
    const next = new Date(hour);
    next.setHours(next.getHours() + 1);
    let hp = 0, furnace = 0, cool = 0;

    for (let i = 0; i < states.length; i++) {
      const st = states[i].value;
      const tStart = new Date(states[i].time);
      const tEnd = i + 1 < states.length ? new Date(states[i + 1].time) : next;
      const segStart = tStart < hour ? hour : tStart;
      const segEnd = tEnd > next ? next : tEnd;
      if (segStart >= segEnd) continue;
      const dur = (segEnd - segStart) / 1000;
      if (st === 1) {
        const mode = modeAt(segStart);
        if (mode === 4) furnace += dur;
        else hp += dur;
      } else if (st === 2) {
        cool += dur;
      }
    }
    const total = (next - hour) / 1000;
    buckets.push({ time: new Date(hour.getTime() + 30 * 60000), hp: hp / total, furnace: furnace / total, cool: cool / total });
    hour = next;
  }
  return buckets;
}

function buildHeaterBuckets(heaterData) {
  if (heaterData.length < 2) return null;
  const buckets = [];
  let hour = new Date(heaterData[0].time);
  hour.setMinutes(0, 0, 0);
  const end = new Date(heaterData[heaterData.length - 1].time);
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);

  while (hour < end) {
    const next = new Date(hour);
    next.setHours(next.getHours() + 1);
    let onSecs = 0;
    for (let i = 0; i < heaterData.length; i++) {
      const val = heaterData[i].value;
      const tStart = new Date(heaterData[i].time);
      const tEnd = i + 1 < heaterData.length ? new Date(heaterData[i + 1].time) : next;
      const segStart = tStart < hour ? hour : tStart;
      const segEnd = tEnd > next ? next : tEnd;
      if (segStart >= segEnd) continue;
      if (val) onSecs += (segEnd - segStart) / 1000;
    }
    const total = (next - hour) / 1000;
    buckets.push({ time: new Date(hour.getTime() + 30 * 60000), duty: onSecs / total });
    hour = next;
  }
  return buckets;
}

function createTempChart(canvas, series, dutyBuckets, title) {
  const datasets = series.map((s) => ({
    label: s.label,
    data: s.data.map((d) => ({ x: new Date(d.time), y: d.value })),
    borderColor: s.color,
    backgroundColor: s.color + "20",
    borderWidth: 2,
    pointRadius: 1.5,
    tension: 0.3,
    yAxisID: "y",
  }));

  if (dutyBuckets) {
    for (const { key, label, color } of [
      { key: "hp", label: "HP Heating", color: COLORS.orange },
      { key: "furnace", label: "Furnace", color: COLORS.darkRed },
      { key: "cool", label: "Cooling", color: COLORS.coolBlue },
      { key: "duty", label: "Heater", color: COLORS.orange },
    ]) {
      if (dutyBuckets[0]?.[key] !== undefined) {
        datasets.push({
          type: "bar",
          label: label + " %",
          data: dutyBuckets.map((b) => ({ x: b.time, y: b[key] })),
          backgroundColor: color + "60",
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          yAxisID: "y1",
        });
      }
    }
  }

  return new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { position: "top", labels: { color: "#ccc", usePointStyle: true, boxWidth: 8 } },
        title: { display: true, text: title, color: "#eee", font: { size: 16 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === "y1") return `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(0)}%`;
              return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}°F`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: { tooltipFormat: "EEE HH:mm", displayFormats: { hour: "EEE HH:mm" } },
          ticks: { color: "#aaa", maxTicksLimit: 20 },
          grid: { color: "#33333380" },
        },
        y: {
          position: "left",
          title: { display: true, text: "°F", color: "#aaa" },
          ticks: { color: "#aaa" },
          grid: { color: "#33333380" },
        },
        y1: {
          position: "right",
          min: 0, max: 1.05,
          title: { display: true, text: "Duty %", color: "#aaa" },
          ticks: { color: "#aaa", callback: (v) => (v * 100).toFixed(0) + "%" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function PlotCanvas({ loader, builder, title }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    try {
      const data = await loader(days);
      if (chartRef.current) chartRef.current.destroy();
      const { series, dutyBuckets } = builder(data);
      chartRef.current = createTempChart(canvasRef.current, series, dutyBuckets, title);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [days, loader, builder, title]);

  useEffect(() => { load(); return () => { if (chartRef.current) chartRef.current.destroy(); }; }, [load]);

  return html`
    <div class="plot-section">
      <div class="plot-controls">
        ${[1, 3, 7, 14, 30].map((d) => html`
          <button key=${d} class=${days === d ? "active" : ""} onClick=${() => setDays(d)}>${d}d</button>
        `)}
      </div>
      ${error && html`<div class="error">${error}</div>`}
      <div class="plot-canvas-wrap">
        <canvas ref=${canvasRef}></canvas>
      </div>
    </div>
  `;
}

export function Plots() {
  const hvacLoader = useCallback((days) => api.get(`/plots/hvac?days=${days}`), []);
  const coopLoader = useCallback((days) => api.get(`/plots/coop?days=${days}`), []);

  const hvacBuilder = useCallback((data) => {
    const byNode = {};
    for (const t of data.temps) {
      if (!byNode[t.nodeId]) byNode[t.nodeId] = { label: t.name, data: [] };
      byNode[t.nodeId].data.push(t);
    }
    const colorMap = { 14: COLORS.red, 15: COLORS.blue, 6: COLORS.green, 16: COLORS.gray };
    const series = Object.entries(byNode).map(([id, s]) => ({ ...s, color: colorMap[id] || "#fff" }));
    const dutyBuckets = buildDutyBuckets(data.states, data.modes, null, null);
    return { series, dutyBuckets };
  }, []);

  const coopBuilder = useCallback((data) => {
    const byNode = {};
    for (const t of data.temps) {
      if (!byNode[t.nodeId]) byNode[t.nodeId] = { label: t.name, data: [] };
      byNode[t.nodeId].data.push(t);
    }
    const colorMap = { 2: COLORS.red, 16: COLORS.gray };
    const series = Object.entries(byNode).map(([id, s]) => ({ ...s, color: colorMap[id] || "#fff" }));
    const dutyBuckets = buildHeaterBuckets(data.heater);
    return { series, dutyBuckets };
  }, []);

  return html`
    <div class="plots-page">
      <h1>HVAC</h1>
      <${PlotCanvas} loader=${hvacLoader} builder=${hvacBuilder} title="Temperature — All Zones + Duty Cycle" />
      <h1>Coop</h1>
      <${PlotCanvas} loader=${coopLoader} builder=${coopBuilder} title="Coop Temperature + Heater Duty Cycle" />
    </div>
  `;
}
