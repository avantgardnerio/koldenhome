#!/usr/bin/env python3
"""
Refined heating demand model using only steady-state overnight data.

Filters out recovery periods to get a cleaner duty-cycle vs ΔT relationship.
Compares with the original (all-data) model.
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

FURNACE_INPUT = 52_000
FURNACE_OUTPUT = 42_000
GAS_COST_PER_THERM = 1.02
BTU_PER_THERM = 100_000
SETPOINT = 62.0

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

# ── Get ALL heating transitions (full period for comparison) ─────────

cur.execute("""
    SELECT time, value::text::int AS state
    FROM events
    WHERE node_id = 61 AND property = 'state'
      AND time > '2026-04-01 00:00:00-06'
      AND time < '2026-04-02 07:00:00-06'
    ORDER BY time
""")
all_transitions = cur.fetchall()

# Deduplicate (thermostat double-reports ~0.6s apart, same state)
# Keep only one per (time_cluster, state) — use last in each cluster
deduped = [all_transitions[0]]
for t, s in all_transitions[1:]:
    if (t - deduped[-1][0]).total_seconds() < 2 and s == deduped[-1][1]:
        continue  # skip duplicate same-state within 2s
    deduped.append((t, s))
# Also remove consecutive same-state entries (e.g., 0→0)
clean = [deduped[0]]
for t, s in deduped[1:]:
    if s != clean[-1][1]:
        clean.append((t, s))
all_transitions = clean

# ── Get outside + kitchen temps ──────────────────────────────────────

cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE node_id = 60 AND property = 'Air temperature'
      AND time > '2026-04-01 00:00:00-06'
      AND time < '2026-04-02 07:00:00-06'
    ORDER BY time
""")
outside_temps = cur.fetchall()

cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE node_id = 61 AND property = 'Air temperature'
      AND time > '2026-04-01 00:00:00-06'
      AND time < '2026-04-02 07:00:00-06'
    ORDER BY time
""")
kitchen_temps = cur.fetchall()

conn.close()


def compute_hourly_duty(transitions, active_states, start, end):
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
        hours.append((h_start, active_seconds / 3600.0))
        t = h_end
    return hours


def interp_temp(temps, at_time):
    for i in range(len(temps) - 1):
        t1, v1 = temps[i]
        t2, v2 = temps[i + 1]
        if t1 <= at_time <= t2:
            frac = (at_time - t1).total_seconds() / (t2 - t1).total_seconds()
            return v1 + frac * (v2 - v1)
    if at_time <= temps[0][0]:
        return temps[0][1]
    return temps[-1][1]


# ── Compute duty for full period and steady-state only ───────────────

full_start = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
full_end = datetime(2026, 4, 2, 13, 0, tzinfo=timezone.utc)
full_hours = compute_hourly_duty(all_transitions, {1, 8}, full_start, full_end)

# Steady-state: overnight Apr 2 00:00-07:00 MDT (06:00-13:00 UTC)
ss_start = datetime(2026, 4, 2, 6, 0, tzinfo=timezone.utc)
ss_end = datetime(2026, 4, 2, 13, 0, tzinfo=timezone.utc)
ss_hours = compute_hourly_duty(all_transitions, {1, 8}, ss_start, ss_end)

def make_points(hours):
    points = []
    for h_start, duty in hours:
        if duty > 0.01:
            h_mid = h_start + timedelta(minutes=30)
            t_out = interp_temp(outside_temps, h_mid)
            t_in = interp_temp(kitchen_temps, h_mid)
            points.append((t_in - t_out, duty, h_start))
    return points

full_points = make_points(full_hours)
ss_points = make_points(ss_hours)

full_dt = np.array([p[0] for p in full_points])
full_duty = np.array([p[1] for p in full_points])
ss_dt = np.array([p[0] for p in ss_points])
ss_duty = np.array([p[1] for p in ss_points])

# Proportional fits (through origin)
m_full = np.sum(full_dt * full_duty) / np.sum(full_dt**2)
m_ss = np.sum(ss_dt * ss_duty) / np.sum(ss_dt**2)

# Free intercept fits
sl_full, int_full, r_full, _, _ = linregress(full_dt, full_duty)
sl_ss, int_ss, r_ss, _, _ = linregress(ss_dt, ss_duty)

UA_full = m_full * FURNACE_OUTPUT
UA_ss = m_ss * FURNACE_OUTPUT


# ── Annual cost projections ──────────────────────────────────────────

AVG_HIGH = np.array([45, 47, 56, 63, 71, 82, 87, 85, 77, 64, 53, 44], dtype=float)
AVG_LOW  = np.array([18, 21, 29, 35, 44, 53, 59, 57, 48, 36, 26, 18], dtype=float)
DAYS     = np.array([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])

def annual_cost(m):
    total = 0
    for hi, lo, days in zip(AVG_HIGH, AVG_LOW, DAYS):
        for t_outside in [hi, lo]:
            delta_t = max(SETPOINT - t_outside, 0)
            duty = min(m * delta_t, 1.0)
            total += duty * FURNACE_INPUT * 24 * days / 2 / BTU_PER_THERM * GAS_COST_PER_THERM
    return total

cost_full = annual_cost(m_full)
cost_ss = annual_cost(m_ss)


# ── Cycle analysis for overnight period ──────────────────────────────

# Extract individual on/off cycle durations from overnight
on_durations = []
off_durations = []
ss_trans = [(t, s) for t, s in all_transitions
            if ss_start <= t < ss_end]

for i in range(len(ss_trans) - 1):
    t1, s1 = ss_trans[i]
    t2, s2 = ss_trans[i + 1]
    dur = (t2 - t1).total_seconds() / 60  # minutes
    if s1 == 1:
        on_durations.append(dur)
    elif s1 == 0:
        off_durations.append(dur)


# ── Plotting ─────────────────────────────────────────────────────────

fig, axes = plt.subplots(2, 2, figsize=(16, 12))

# ── Plot 1: Scatter comparison ───────────────────────────────────────
ax1 = axes[0, 0]
ax1.scatter(full_dt, full_duty * 100, color='#e74c3c', s=50, alpha=0.4,
            label=f'All data (n={len(full_dt)})', edgecolors='black', linewidth=0.3)
ax1.scatter(ss_dt, ss_duty * 100, color='#2ecc71', s=80, zorder=5,
            label=f'Steady-state overnight (n={len(ss_dt)})', edgecolors='black', linewidth=0.5)

dt_fit = np.linspace(0, 35, 100)
ax1.plot(dt_fit, m_full * dt_fit * 100, '--', color='#e74c3c', alpha=0.7,
         label=f'All data: {m_full*100:.2f}%/°F')
ax1.plot(dt_fit, m_ss * dt_fit * 100, '-', color='#2ecc71', linewidth=2,
         label=f'Steady-state: {m_ss*100:.2f}%/°F')

ax1.set_xlabel('ΔT = T_inside − T_outside (°F)', fontsize=11)
ax1.set_ylabel('Heating Duty Cycle (%)', fontsize=11)
ax1.set_title('Heating Demand: All Data vs Steady-State', fontsize=13, fontweight='bold')
ax1.legend(fontsize=9)
ax1.grid(True, alpha=0.3)
ax1.set_xlim(0, 35)
ax1.set_ylim(0, 70)

stats = (
    f'All data model:\n'
    f'  m = {m_full*100:.2f}%/°F, UA = {UA_full:.0f} BTU/hr·°F\n'
    f'  R² = {r_full**2:.3f}\n'
    f'  Annual cost: ${cost_full:,.0f}\n\n'
    f'Steady-state model:\n'
    f'  m = {m_ss*100:.2f}%/°F, UA = {UA_ss:.0f} BTU/hr·°F\n'
    f'  R² = {r_ss**2:.3f}\n'
    f'  Annual cost: ${cost_ss:,.0f}'
)
ax1.text(0.03, 0.97, stats, transform=ax1.transAxes, fontsize=9,
         verticalalignment='top', family='monospace',
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

# ── Plot 2: Cycle duration histogram ─────────────────────────────────
ax2 = axes[0, 1]
if on_durations:
    ax2.hist(on_durations, bins=15, color='#e74c3c', alpha=0.6, label='On (heating)', edgecolor='black')
if off_durations:
    ax2.hist(off_durations, bins=15, color='#3498db', alpha=0.6, label='Off (idle)', edgecolor='black')
ax2.set_xlabel('Cycle Duration (minutes)', fontsize=11)
ax2.set_ylabel('Count', fontsize=11)
ax2.set_title('Overnight Cycle Durations (Steady-State)', fontsize=13, fontweight='bold')
ax2.legend(fontsize=10)
ax2.grid(True, alpha=0.3, axis='y')

if on_durations and off_durations:
    ax2.text(0.97, 0.97,
             f'On:  mean={np.mean(on_durations):.1f} min, n={len(on_durations)}\n'
             f'Off: mean={np.mean(off_durations):.1f} min, n={len(off_durations)}\n'
             f'Duty: {np.sum(on_durations)/(np.sum(on_durations)+np.sum(off_durations))*100:.1f}%',
             transform=ax2.transAxes, fontsize=10, verticalalignment='top',
             horizontalalignment='right', family='monospace',
             bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8))

# ── Plot 3: Annual cost comparison ───────────────────────────────────
ax3 = axes[1, 0]
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
x = np.arange(12)
w = 0.35

monthly_full = []
monthly_ss = []
for hi, lo, days in zip(AVG_HIGH, AVG_LOW, DAYS):
    mf = ms = 0
    for t_outside in [hi, lo]:
        delta_t = max(SETPOINT - t_outside, 0)
        mf += min(m_full * delta_t, 1.0) * FURNACE_INPUT * 24 * days / 2 / BTU_PER_THERM * GAS_COST_PER_THERM
        ms += min(m_ss * delta_t, 1.0) * FURNACE_INPUT * 24 * days / 2 / BTU_PER_THERM * GAS_COST_PER_THERM
    monthly_full.append(mf)
    monthly_ss.append(ms)

ax3.bar(x - w/2, monthly_full, w, color='#e74c3c', alpha=0.5, label=f'All data (${cost_full:,.0f}/yr)')
ax3.bar(x + w/2, monthly_ss, w, color='#2ecc71', alpha=0.7, label=f'Steady-state (${cost_ss:,.0f}/yr)')

ax3.set_xticks(x)
ax3.set_xticklabels(MONTHS)
ax3.set_ylabel('Monthly Gas Cost ($)', fontsize=11)
ax3.set_title('Annual Forecast: All Data vs Steady-State Model', fontsize=13, fontweight='bold')
ax3.legend(fontsize=10)
ax3.grid(True, alpha=0.3, axis='y')

ax3.text(0.97, 0.97,
         f'Difference: ${cost_full - cost_ss:,.0f}/yr\n'
         f'({(cost_full - cost_ss)/cost_full*100:.1f}% overestimate\n'
         f' from recovery bias)',
         transform=ax3.transAxes, fontsize=10, verticalalignment='top',
         horizontalalignment='right', family='monospace',
         bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8))

# ── Plot 4: Overnight duty cycle time series ─────────────────────────
ax4 = axes[1, 1]
ax4r = ax4.twinx()

# Plot outside temp
out_t = [(t.astimezone(mtn), v) for t, v in outside_temps if ss_start <= t <= ss_end]
if out_t:
    ax4.plot([t for t, _ in out_t], [v for _, v in out_t], color='gray', alpha=0.6,
             linewidth=1.5, label='Outside')

# Plot kitchen temp
kit_t = [(t.astimezone(mtn), v) for t, v in kitchen_temps if ss_start <= t <= ss_end]
if kit_t:
    ax4.plot([t for t, _ in kit_t], [v for _, v in kit_t], color='#2ecc71',
             linewidth=2, label='Kitchen')

# Duty cycle bars
for h_start, duty in ss_hours:
    if duty > 0:
        ax4r.bar(h_start.astimezone(mtn) + timedelta(minutes=30), duty * 100,
                 width=1/24*0.85, color='#e74c3c', alpha=0.3)

ax4.axhline(62, color='#e74c3c', linestyle='--', alpha=0.4)
ax4.set_xlabel('Time (Apr 2)', fontsize=11)
ax4.set_ylabel('Temperature (°F)', fontsize=11)
ax4r.set_ylabel('Duty Cycle (%)', fontsize=11, color='#e74c3c')
ax4.set_title('Overnight Steady-State Window', fontsize=13, fontweight='bold')
ax4.legend(fontsize=9, loc='upper left')
ax4.grid(True, alpha=0.3)
ax4r.set_ylim(0, 100)
ax4.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M', tz=mtn))
ax4.xaxis.set_major_locator(mdates.HourLocator(interval=1, tz=mtn))
fig.autofmt_xdate()

fig.suptitle('Steady-State Heating Model Refinement', fontsize=16, fontweight='bold', y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.96])
fig.savefig('steady_state_fit.png', dpi=150, bbox_inches='tight')
print("Saved steady_state_fit.png")
plt.show()

# ── Summary ──────────────────────────────────────────────────────────
print("\n" + "="*65)
print("STEADY-STATE MODEL REFINEMENT")
print("="*65)
print(f"\nAll data (13 hrs, includes recovery):")
print(f"  m = {m_full*100:.2f}%/°F | UA = {UA_full:.0f} BTU/hr·°F | Annual: ${cost_full:,.0f}")
print(f"  R² = {r_full**2:.3f}")
print(f"\nSteady-state overnight (7 hrs, maintenance only):")
print(f"  m = {m_ss*100:.2f}%/°F | UA = {UA_ss:.0f} BTU/hr·°F | Annual: ${cost_ss:,.0f}")
print(f"  R² = {r_ss**2:.3f}")
print(f"\nRecovery bias: ${cost_full - cost_ss:,.0f}/yr ({(cost_full-cost_ss)/cost_full*100:.1f}% overestimate)")
if on_durations and off_durations:
    print(f"\nOvernight cycle stats:")
    print(f"  On:  {np.mean(on_durations):.1f} ± {np.std(on_durations):.1f} min (n={len(on_durations)})")
    print(f"  Off: {np.mean(off_durations):.1f} ± {np.std(off_durations):.1f} min (n={len(off_durations)})")
    print(f"  Overall duty: {np.sum(on_durations)/(np.sum(on_durations)+np.sum(off_durations))*100:.1f}%")
    print(f"  Outside temp range: {min(ss_dt):.1f}–{max(ss_dt):.1f}°F ΔT")
print()
