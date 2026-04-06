#!/usr/bin/env python3
"""
Heating demand model: duty cycle vs ΔT, UA coefficient, energy cost projection.

Uses state transitions for proper time-weighted duty cycle, correlates with
outside temperature, and projects furnace gas consumption at any outside temp.
"""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import numpy as np
from scipy.stats import linregress
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')

# Carrier WeatherMaker 8000 specs (from nameplate)
# Low fire — short cycles (~5-6 min) suggest board never escalates to high
FURNACE_INPUT = 52_000    # BTU/hr (gas consumed at low fire)
FURNACE_OUTPUT = 42_000   # BTU/hr (heat delivered at low fire)
EFFICIENCY = 0.8077       # 42000/52000

# Xcel Energy residential gas rate, Fort Collins CO
# EIA data: Colorado residential avg $10.57/MCF (Jan 2026)
# 1 MCF ≈ 10.37 therms → $10.57/10.37 ≈ $1.02/therm
# Winter months (Nov-Mar) avg ~$10.00-10.50/MCF → ~$0.97-1.01/therm
GAS_COST_PER_THERM = 1.02
BTU_PER_THERM = 100_000

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

# ── 1. Get all heating state transitions ─────────────────────────────

cur.execute("""
    SELECT time, value::text::int AS state
    FROM events
    WHERE node_id = 61 AND property = 'state'
      AND time > '2026-04-01 00:00:00-06'
      AND time < '2026-04-02 07:00:00-06'
    ORDER BY time
""")
heat_transitions = cur.fetchall()

# ── 2. Get outside temp for the same period ──────────────────────────

cur.execute("""
    SELECT time, value::text::float AS temp
    FROM events
    WHERE node_id = 60 AND property = 'Air temperature'
      AND time > '2026-04-01 00:00:00-06'
      AND time < '2026-04-02 07:00:00-06'
    ORDER BY time
""")
outside_temps = cur.fetchall()

# ── 3. Get kitchen (thermostat) temp ─────────────────────────────────

cur.execute("""
    SELECT time, value::text::float AS temp
    FROM events
    WHERE node_id = 61 AND property = 'Air temperature'
      AND time > '2026-04-01 00:00:00-06'
      AND time < '2026-04-02 07:00:00-06'
    ORDER BY time
""")
kitchen_temps = cur.fetchall()

conn.close()


# ── Helper: compute hourly duty cycle from state transitions ─────────

def compute_hourly_duty(transitions, active_states, start, end):
    """Time-weighted duty cycle per hour from state transitions."""
    hours = []
    t = start
    while t < end:
        h_start = t
        h_end = t + timedelta(hours=1)

        relevant = [(ts, st) for ts, st in transitions if h_start <= ts < h_end]

        prior = [st for ts, st in transitions if ts < h_start]
        current_state = prior[-1] if prior else 0

        active_seconds = 0
        cursor = h_start

        for ts, new_state in relevant:
            if current_state in active_states:
                active_seconds += (ts - cursor).total_seconds()
            cursor = ts
            current_state = new_state

        if current_state in active_states:
            active_seconds += (h_end - cursor).total_seconds()

        duty = active_seconds / 3600.0
        hours.append((h_start, duty))
        t = h_end

    return hours


# ── Helper: interpolate temp at a given time ─────────────────────────

def interp_temp(temps, at_time):
    """Linear interpolation of temperature at a given time."""
    for i in range(len(temps) - 1):
        t1, v1 = temps[i]
        t2, v2 = temps[i + 1]
        if t1 <= at_time <= t2:
            frac = (at_time - t1).total_seconds() / (t2 - t1).total_seconds()
            return v1 + frac * (v2 - v1)
    if at_time <= temps[0][0]:
        return temps[0][1]
    return temps[-1][1]


# ── Compute heating duty cycle per hour ──────────────────────────────

heat_start = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
heat_end = datetime(2026, 4, 2, 13, 0, tzinfo=timezone.utc)
heating_hours = compute_hourly_duty(heat_transitions, {1, 8}, heat_start, heat_end)

# Pair each hour with ΔT (inside - outside)
heat_points = []
for h_start, duty in heating_hours:
    if duty > 0.01:
        h_mid = h_start + timedelta(minutes=30)
        t_outside = interp_temp(outside_temps, h_mid)
        t_inside = interp_temp(kitchen_temps, h_mid)
        delta_t = t_inside - t_outside
        heat_points.append((delta_t, duty, h_start))


# ── Linear fit: duty_cycle = (UA / Q_furnace) × ΔT ──────────────────

heat_dt = np.array([p[0] for p in heat_points])
heat_duty = np.array([p[1] for p in heat_points])

# Force through origin: duty = m × ΔT (physics says heat loss ∝ ΔT)
m_heat = np.sum(heat_dt * heat_duty) / np.sum(heat_dt**2)

# Free intercept for R²
slope, intercept, r_value, p_value, std_err = linregress(heat_dt, heat_duty)

# UA coefficient: duty = UA × ΔT / Q_furnace → UA = m × Q_furnace
UA = m_heat * FURNACE_OUTPUT
t_inside = 62.0  # heating setpoint


# ── Plotting ─────────────────────────────────────────────────────────

fig, axes = plt.subplots(2, 2, figsize=(16, 12))

# ── Plot 1: Duty cycle vs ΔT scatter + fit ───────────────────────────
ax1 = axes[0, 0]
ax1.scatter(heat_dt, heat_duty * 100, color='#e74c3c', s=60, zorder=5,
            label='Heating (Apr 1–2)', edgecolors='black', linewidth=0.5)

dt_fit = np.linspace(0, 40, 100)
ax1.plot(dt_fit, m_heat * dt_fit * 100, '--', color='#e74c3c', alpha=0.7,
         label=f'Fit: duty = {m_heat*100:.2f}%/°F × ΔT')
ax1.plot(dt_fit, slope * dt_fit * 100 + intercept * 100, ':', color='gray', alpha=0.5,
         label=f'Free intercept (R²={r_value**2:.3f})')

ax1.set_xlabel('ΔT = T_inside − T_outside (°F)', fontsize=11)
ax1.set_ylabel('Heating Duty Cycle (%)', fontsize=11)
ax1.set_title('Heating Demand vs Temperature Differential', fontsize=13, fontweight='bold')
ax1.legend(fontsize=9)
ax1.grid(True, alpha=0.3)
ax1.set_xlim(0, 40)
ax1.set_ylim(0, 100)

stats_text = (
    f'Proportional fit (through origin):\n'
    f'  duty = {m_heat*100:.2f}% per °F of ΔT\n'
    f'  UA = {UA:,.0f} BTU/hr·°F\n'
    f'  (low fire: {FURNACE_OUTPUT:,} BTU/hr output)\n\n'
    f'Free intercept fit:\n'
    f'  slope = {slope*100:.2f}%/°F\n'
    f'  intercept = {intercept*100:.1f}%\n'
    f'  R² = {r_value**2:.3f}'
)
ax1.text(0.03, 0.97, stats_text, transform=ax1.transAxes, fontsize=9,
         verticalalignment='top', family='monospace',
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

# ── Plot 2: Projected duty cycle vs outside temp ─────────────────────
ax2 = axes[0, 1]
t_outside_range = np.linspace(-10, 65, 200)

duty_vs_outside = np.clip(m_heat * (t_inside - t_outside_range), 0, 1)

ax2.plot(t_outside_range, duty_vs_outside * 100, color='#e74c3c', linewidth=2)
ax2.axhline(100, color='gray', linestyle=':', alpha=0.5, label='100% = furnace maxed out')
ax2.axvline(t_inside, color='#2ecc71', linestyle='--', alpha=0.5, label=f'Setpoint ({t_inside}°F)')

# Mark where furnace maxes out
max_dt = 1.0 / m_heat
t_outside_max = t_inside - max_dt
ax2.axvline(t_outside_max, color='#e74c3c', linestyle=':', alpha=0.7,
            label=f'Furnace limit: {t_outside_max:.0f}°F outside')

# Mark observed data range
ax2.axvspan(34, 55, alpha=0.1, color='orange', label='Observed range (Apr 1–2)')

ax2.set_xlabel('Outside Temperature (°F)', fontsize=11)
ax2.set_ylabel('Projected Heating Duty Cycle (%)', fontsize=11)
ax2.set_title('Heating Demand Projection (Setpoint 62°F)', fontsize=13, fontweight='bold')
ax2.legend(fontsize=9, loc='upper right')
ax2.grid(True, alpha=0.3)
ax2.set_xlim(-10, 65)
ax2.set_ylim(0, 110)
ax2.invert_xaxis()

# ── Plot 3: Projected daily gas cost ─────────────────────────────────
ax3 = axes[1, 0]

gas_cost_per_day = np.clip(m_heat * (t_inside - t_outside_range), 0, 1) * FURNACE_INPUT * 24 / BTU_PER_THERM * GAS_COST_PER_THERM

ax3.plot(t_outside_range, gas_cost_per_day, color='#f39c12', linewidth=2)
ax3.fill_between(t_outside_range, 0, gas_cost_per_day, alpha=0.15, color='#f39c12')

for t_ref in [0, 20, 40]:
    dt = max(t_inside - t_ref, 0)
    duty = min(m_heat * dt, 1.0)
    cost = duty * FURNACE_INPUT * 24 / BTU_PER_THERM * GAS_COST_PER_THERM
    ax3.plot(t_ref, cost, 'o', color='#e74c3c', markersize=8)
    ax3.annotate(f'${cost:.2f}/day', (t_ref, cost), textcoords="offset points",
                 xytext=(10, 10), fontsize=9,
                 bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.8))

ax3.set_xlabel('Outside Temperature (°F)', fontsize=11)
ax3.set_ylabel('Estimated Gas Cost ($/day)', fontsize=11)
ax3.set_title('Projected Daily Heating Cost', fontsize=13, fontweight='bold')
ax3.grid(True, alpha=0.3)
ax3.set_xlim(-10, 65)
ax3.invert_xaxis()

cost_text = (
    f'Furnace: Carrier WeatherMaker 8000\n'
    f'  Low fire: {FURNACE_INPUT:,} BTU/hr input\n'
    f'  Efficiency: {EFFICIENCY*100:.1f}%\n'
    f'  Gas rate: ${GAS_COST_PER_THERM:.2f}/therm\n'
    f'    (EIA CO avg, Jan 2026)\n\n'
    f'At 20°F outside, 62°F setpoint:\n'
    f'  ΔT = 42°F → duty ≈ {min(m_heat*42, 1)*100:.0f}%\n'
    f'  Gas ≈ {min(m_heat*42, 1)*FURNACE_INPUT/1000:.0f}k BTU/hr\n'
    f'  Cost ≈ ${min(m_heat*42, 1)*FURNACE_INPUT*24/BTU_PER_THERM*GAS_COST_PER_THERM:.2f}/day'
)
ax3.text(0.97, 0.97, cost_text, transform=ax3.transAxes, fontsize=9,
         verticalalignment='top', horizontalalignment='right', family='monospace',
         bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8))

# ── Plot 4: Time series of Apr 1-2 with duty cycle overlay ──────────
ax4 = axes[1, 1]
ax4r = ax4.twinx()

out_times = [t for t, _ in outside_temps]
out_vals = [v for _, v in outside_temps]
ax4.plot(out_times, out_vals, color='gray', alpha=0.6, linewidth=1.5, label='Outside')

kit_times = [t for t, _ in kitchen_temps]
kit_vals = [v for _, v in kitchen_temps]
ax4.plot(kit_times, kit_vals, color='#2ecc71', linewidth=2, label='Kitchen')

for h_start, duty in heating_hours:
    if duty > 0:
        ax4r.bar(h_start + timedelta(minutes=30), duty * 100, width=1/24*0.85,
                 color='#e74c3c', alpha=0.3, zorder=1)

ax4.axhline(62, color='#e74c3c', linestyle='--', alpha=0.4, linewidth=1)
ax4.set_xlabel('Time', fontsize=11)
ax4.set_ylabel('Temperature (°F)', fontsize=11)
ax4r.set_ylabel('Duty Cycle (%)', fontsize=11, color='#e74c3c')
ax4.set_title('Apr 1–2: Temps & Heating Duty Cycle', fontsize=13, fontweight='bold')
ax4.legend(fontsize=9, loc='upper left')
ax4.grid(True, alpha=0.3)
ax4r.set_ylim(0, 100)
ax4.xaxis.set_major_formatter(mdates.DateFormatter('%a %H:%M', tz=mtn))
ax4.xaxis.set_major_locator(mdates.HourLocator(interval=4, tz=mtn))
fig.autofmt_xdate()

fig.suptitle('Heating Demand Model — KoldenHome', fontsize=16, fontweight='bold', y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.96])
fig.savefig('heating_demand.png', dpi=150, bbox_inches='tight')
print("Saved heating_demand.png")
plt.show()

# ── Print summary ────────────────────────────────────────────────────
print("\n" + "="*60)
print("HEATING DEMAND MODEL SUMMARY")
print("="*60)
print(f"\nData: {len(heat_points)} hours of heating from Apr 1–2, 2026")
print(f"Outside temp range: {min(heat_dt):.0f}–{max(heat_dt):.0f}°F ΔT")
print(f"Duty cycle range: {min(heat_duty)*100:.0f}–{max(heat_duty)*100:.0f}%")
print(f"\nProportional model: duty = {m_heat*100:.2f}% per °F of ΔT")
print(f"UA coefficient: {UA:,.0f} BTU/hr·°F")
print(f"Furnace maxes out at ΔT = {1/m_heat:.0f}°F → outside = {t_inside - 1/m_heat:.0f}°F")
print(f"\nProjected costs (setpoint 62°F, low fire {FURNACE_INPUT:,} BTU/hr, ${GAS_COST_PER_THERM}/therm):")
for t_out in [50, 40, 30, 20, 10, 0, -10]:
    dt = t_inside - t_out
    duty = min(m_heat * dt, 1.0)
    cost = duty * FURNACE_INPUT * 24 / BTU_PER_THERM * GAS_COST_PER_THERM
    therms = duty * FURNACE_INPUT * 24 / BTU_PER_THERM
    print(f"  {t_out:4d}°F outside → {duty*100:5.1f}% duty → "
          f"{therms:.1f} therms/day → ${cost:.2f}/day")
print()
