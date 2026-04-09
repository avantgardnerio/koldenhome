#!/usr/bin/env python3
"""
Steady-state heating analysis: UA from duty cycle vs ΔT.

When the thermostat holds indoor temp flat (±1°F), furnace output exactly
offsets heat loss. Energy balance: Q_furnace × duty = UA × ΔT, so plotting
duty vs ΔT gives a line through the origin with slope UA/Q.

1. Query thermostat temp, outside temp, and furnace operating state (7 days)
2. Slide 2-hour windows; keep windows where thermostat range ≤ 2°F and duty > 0
3. Scatter plot duty vs ΔT, fit linear through origin → UA
4. Time series of duty cycle and outside temp for context
"""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import timedelta
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')
Q_FURNACE = 42_000      # BTU/hr low fire output
WINDOW_H = 2.0          # window size in hours
STEP_H = 0.5            # window step in hours
FLAT_RANGE_F = 2.0      # max temp range to count as "flat"
MIN_STATE_EVENTS = 4    # min state transitions in window (need cycling data)

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

# --- Outside temp (node 60) ---
cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id = 60
      AND time > NOW() - INTERVAL '7 days'
    ORDER BY time
""")
outside_temps = cur.fetchall()
print(f"Outside temp readings: {len(outside_temps)}")

# --- Furnace operating state (node 61, CC 66) ---
cur.execute("""
    SELECT time, value::text::int
    FROM events
    WHERE node_id = 61
      AND property = 'state'
      AND command_class = 66
      AND time > NOW() - INTERVAL '7 days'
    ORDER BY time
""")
state_rows = cur.fetchall()
print(f"Operating state events: {len(state_rows)}")

# --- Thermostat indoor temp (node 61) ---
cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id = 61
      AND time > NOW() - INTERVAL '7 days'
    ORDER BY time
""")
indoor_temps = cur.fetchall()
print(f"Thermostat temp readings: {len(indoor_temps)}")

conn.close()


def get_outside_temp_at(t):
    """Nearest outside temp reading to time t."""
    if not outside_temps:
        return 45.0
    best = min(outside_temps, key=lambda x: abs((x[0] - t).total_seconds()))
    # Only use if within 1 hour
    if abs((best[0] - t).total_seconds()) > 3600:
        return None
    return best[1]


def duty_in_window(t_start, t_end):
    """Compute furnace duty cycle from state events in [t_start, t_end].

    Uses step-function interpolation: each state event sets the state until
    the next event. We need the state before the window to know the initial
    state.
    """
    # Find initial state (last event before or at t_start)
    initial_state = 0
    events_in_window = []
    for t, state in state_rows:
        if t <= t_start:
            initial_state = state
        elif t <= t_end:
            events_in_window.append((t, state))
        else:
            break

    if not events_in_window:
        # No transitions in window — constant state
        return (1.0 if initial_state != 0 else 0.0), 0

    # Walk through window computing active time
    active_s = 0.0
    total_s = (t_end - t_start).total_seconds()
    prev_t = t_start
    prev_state = initial_state

    for t, state in events_in_window:
        dt = (t - prev_t).total_seconds()
        if prev_state != 0:
            active_s += dt
        prev_t = t
        prev_state = state

    # Remainder after last event
    dt = (t_end - prev_t).total_seconds()
    if prev_state != 0:
        active_s += dt

    return active_s / total_s, len(events_in_window)


def temps_in_window(t_start, t_end):
    """Get thermostat temp readings in [t_start, t_end]."""
    return [(t, v) for t, v in indoor_temps if t_start <= t <= t_end]


# --- Build windows ---
if not indoor_temps or not state_rows:
    print("Insufficient data")
    exit(1)

t_min = max(indoor_temps[0][0], state_rows[0][0])
t_max = min(indoor_temps[-1][0], state_rows[-1][0])
window = timedelta(hours=WINDOW_H)
step = timedelta(hours=STEP_H)

windows = []  # (center_time, duty, T_indoor, T_outside, delta_T)
t = t_min
while t + window <= t_max:
    t_start = t
    t_end = t + window
    t_center = t + window / 2

    # Indoor temps in window
    pts = temps_in_window(t_start, t_end)
    if len(pts) < 2:
        t += step
        continue

    temps = [v for _, v in pts]
    temp_range = max(temps) - min(temps)

    # Only flat segments
    if temp_range > FLAT_RANGE_F:
        t += step
        continue

    T_indoor = np.mean(temps)

    # Duty cycle
    duty, n_events = duty_in_window(t_start, t_end)
    if duty <= 0 or n_events < MIN_STATE_EVENTS:
        t += step
        continue

    # Outside temp
    T_outside = get_outside_temp_at(t_center)
    if T_outside is None:
        t += step
        continue

    delta_T = T_indoor - T_outside
    if delta_T < 1.0:  # furnace shouldn't run if inside ≈ outside
        t += step
        continue

    windows.append((t_center, duty, T_indoor, T_outside, delta_T))
    t += step

print(f"Steady-state windows: {len(windows)}")

if not windows:
    print("No valid windows found")
    exit(1)

# Extract arrays
center_times = [w[0] for w in windows]
duties = np.array([w[1] for w in windows])
T_indoors = np.array([w[2] for w in windows])
T_outsides = np.array([w[3] for w in windows])
delta_Ts = np.array([w[4] for w in windows])


# --- Fit: duty = (UA/Q) * ΔT  →  linear through origin ---
def linear_origin(x, slope):
    return slope * x


popt, pcov = curve_fit(linear_origin, delta_Ts, duties, p0=[0.01])
slope = popt[0]
UA = slope * Q_FURNACE

# R²
y_pred = linear_origin(delta_Ts, slope)
ss_res = np.sum((duties - y_pred) ** 2)
ss_tot = np.sum((duties - np.mean(duties)) ** 2)
r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0

print(f"\nFit: duty = {slope:.5f} × ΔT")
print(f"UA = {UA:.0f} BTU/hr·°F")
print(f"R² = {r_squared:.3f}")
print(f"ΔT range: {delta_Ts.min():.1f} – {delta_Ts.max():.1f}°F")
print(f"Duty range: {duties.min():.1%} – {duties.max():.1%}")

# --- Plot: 2 rows, 1 column ---
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 9), height_ratios=[1.2, 1])

# --- Top: duty cycle vs ΔT scatter with fit ---
# Color points by time of day (night=blue, day=orange) to show solar confound
hours = np.array([(t.astimezone(mtn).hour + t.astimezone(mtn).minute / 60)
                  for t in center_times])
is_night = (hours < 7) | (hours >= 20)  # 8pm-7am
is_day = ~is_night

if np.any(is_night):
    ax1.scatter(delta_Ts[is_night], duties[is_night] * 100, c='#2c3e50',
                s=30, alpha=0.7, label='Night (20:00–07:00)', zorder=3)
if np.any(is_day):
    ax1.scatter(delta_Ts[is_day], duties[is_day] * 100, c='#e67e22',
                s=30, alpha=0.7, label='Day (07:00–20:00)', zorder=3)

# Fit line
x_fit = np.linspace(0, delta_Ts.max() * 1.1, 100)
ax1.plot(x_fit, linear_origin(x_fit, slope) * 100, 'r--', linewidth=2,
         label=f'Fit: duty = {slope*100:.3f}% × ΔT', zorder=4)

ax1.set_xlabel('ΔT = T_indoor − T_outside (°F)', fontsize=12)
ax1.set_ylabel('Furnace duty cycle (%)', fontsize=12)
ax1.set_title('Steady-State Heating: Duty Cycle vs Temperature Difference',
              fontsize=14, fontweight='bold')
ax1.set_xlim(left=0)
ax1.set_ylim(bottom=0)
ax1.grid(True, alpha=0.3)
ax1.legend(fontsize=10, loc='upper left')

stats = (
    f'UA = {UA:.0f} BTU/hr·°F\n'
    f'Q_furnace = {Q_FURNACE:,} BTU/hr\n'
    f'R² = {r_squared:.3f}\n'
    f'Windows: {len(windows)}\n'
    f'Window: {WINDOW_H:.0f}h, step {STEP_H:.1f}h'
)
ax1.text(0.97, 0.03, stats, transform=ax1.transAxes, fontsize=10,
         verticalalignment='bottom', horizontalalignment='right',
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

# --- Bottom: time series of duty cycle and outside temp ---
ax2_duty = ax2
ax2_temp = ax2.twinx()

local_times = [t.astimezone(mtn) for t in center_times]
ax2_duty.bar(local_times, duties * 100, width=STEP_H / 24, color='#e74c3c',
             alpha=0.6, label='Duty cycle', zorder=2)
ax2_duty.set_ylabel('Duty cycle (%)', fontsize=12, color='#e74c3c')
ax2_duty.tick_params(axis='y', labelcolor='#e74c3c')
ax2_duty.set_ylim(bottom=0)

# Outside temp as line
out_times = [t.astimezone(mtn) for t, _ in outside_temps]
out_vals = [v for _, v in outside_temps]
ax2_temp.plot(out_times, out_vals, '-', color='#3498db', linewidth=1.5,
              alpha=0.8, label='Outside temp')
# Indoor temp
in_times = [t.astimezone(mtn) for t, _ in indoor_temps]
in_vals = [v for _, v in indoor_temps]
ax2_temp.plot(in_times, in_vals, '-', color='#2ecc71', linewidth=1.5,
              alpha=0.8, label='Thermostat temp')
ax2_temp.set_ylabel('Temperature (°F)', fontsize=12)

ax2.set_xlabel('Date/Time', fontsize=12)
ax2.set_title('Duty Cycle and Temperatures Over Time', fontsize=13, fontweight='bold')
ax2.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
ax2.xaxis.set_major_locator(mdates.DayLocator(tz=mtn))
ax2.tick_params(axis='x', rotation=30)
ax2.grid(True, alpha=0.3)

# Combined legend
lines1, labels1 = ax2_duty.get_legend_handles_labels()
lines2, labels2 = ax2_temp.get_legend_handles_labels()
ax2.legend(lines1 + lines2, labels1 + labels2, fontsize=9, loc='upper right')

plt.tight_layout()
plt.savefig('heating_curve_fit.png', dpi=150, bbox_inches='tight')
print("\nSaved heating_curve_fit.png")
plt.show()
