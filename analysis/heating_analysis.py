#!/usr/bin/env python3
"""
Heating analysis: start by visualizing all temps + furnace state.
"""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

# --- Outside temp (node 60) ---
cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id = 60
      AND time > '2026-04-01'::timestamptz AND time < '2026-04-07'::timestamptz
    ORDER BY time
""")
outside = cur.fetchall()

# --- Top floor (node 58) ---
cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id = 58
      AND time > '2026-04-01'::timestamptz AND time < '2026-04-07'::timestamptz
    ORDER BY time
""")
top_floor = cur.fetchall()

# --- Thermostat / kitchen (node 61) ---
cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id = 61
      AND time > '2026-04-01'::timestamptz AND time < '2026-04-07'::timestamptz
    ORDER BY time
""")
kitchen = cur.fetchall()

# --- Furnace operating state (node 61, CC 66) ---
cur.execute("""
    SELECT time, value::text::int
    FROM events
    WHERE node_id = 61
      AND property = 'state'
      AND command_class = 66
      AND time > '2026-04-01'::timestamptz AND time < '2026-04-07'::timestamptz
    ORDER BY time
""")
state_rows = cur.fetchall()

conn.close()

print(f"Outside: {len(outside)}, Top floor: {len(top_floor)}, Kitchen: {len(kitchen)}, State events: {len(state_rows)}")

# --- Build furnace on/off spans for shading ---
spans = []  # (start, end, state)
for i, (t, state) in enumerate(state_rows):
    end = state_rows[i + 1][0] if i + 1 < len(state_rows) else t
    if state != 0:
        spans.append((t, end, state))

# --- Find steady-state heating segments ---
# Steady state = kitchen temp flat (±1.5°F) AND furnace cycling
FLAT_RANGE_F = 1.5
MIN_DURATION_H = 2.0
GAP_TOLERANCE_S = 60 * 60  # merge segments within 1 hour

def furnace_cycling_between(t_start, t_end):
    """Check if furnace had at least 2 on/off transitions in the interval."""
    transitions = [t for t, s in state_rows if t_start <= t <= t_end]
    return len(transitions) >= 4  # need a few cycles

def find_steady_state_segments():
    """Slide through kitchen temps, find flat regions with furnace cycling."""
    if len(kitchen) < 3:
        return []

    segments = []
    seg_start = 0

    i = 0
    while i < len(kitchen):
        # Start a candidate segment
        j = i + 1
        while j < len(kitchen):
            window = [v for _, v in kitchen[i:j+1]]
            if max(window) - min(window) > FLAT_RANGE_F:
                break
            j += 1
        j -= 1  # last valid index

        # Check minimum duration
        duration_h = (kitchen[j][0] - kitchen[i][0]).total_seconds() / 3600
        if duration_h >= MIN_DURATION_H:
            # Check furnace was cycling
            if furnace_cycling_between(kitchen[i][0], kitchen[j][0]):
                segments.append((kitchen[i][0], kitchen[j][0]))

        i = j + 1

    # Merge close segments
    if not segments:
        return segments
    merged = [segments[0]]
    for start, end in segments[1:]:
        prev_start, prev_end = merged[-1]
        if (start - prev_end).total_seconds() <= GAP_TOLERANCE_S:
            merged[-1] = (prev_start, end)
        else:
            merged.append((start, end))

    return merged

steady_segments = find_steady_state_segments()
print(f"Steady-state segments: {len(steady_segments)}")
for i, (start, end) in enumerate(steady_segments):
    dur = (end - start).total_seconds() / 3600
    print(f"  Seg {i+1}: {start.astimezone(mtn):%m/%d %H:%M} – {end.astimezone(mtn):%m/%d %H:%M} ({dur:.1f}h)")

# --- Continuous duty cycle (Gaussian-weighted moving average) ---
from datetime import timedelta

state_times = [t for t, _ in state_rows]
state_vals = [s for _, s in state_rows]

DUTY_SIGMA_S = 30 * 60   # 30-minute Gaussian σ
DUTY_STEP_S = 5 * 60     # sample every 5 minutes

def furnace_state_at(t):
    """Get furnace state at time t from step function."""
    state = 0
    for i, st in enumerate(state_times):
        if st > t:
            break
        state = state_vals[i]
    return state

def compute_continuous_duty():
    """Gaussian-weighted moving average of furnace on/off state."""
    if len(state_times) < 2:
        return [], []
    t_start = state_times[0]
    t_end = state_times[-1]

    # Pre-build 1-minute resolution step function for fast convolution
    resolution_s = 60
    n_steps = int((t_end - t_start).total_seconds() / resolution_s) + 1
    step_fn = np.zeros(n_steps)
    for i in range(len(state_times)):
        idx_start = int((state_times[i] - t_start).total_seconds() / resolution_s)
        idx_end = (int((state_times[i+1] - t_start).total_seconds() / resolution_s)
                   if i + 1 < len(state_times) else n_steps)
        if state_vals[i] == 1:
            step_fn[idx_start:idx_end] = 1.0

    # Gaussian kernel
    kernel_width = int(3 * DUTY_SIGMA_S / resolution_s)  # 3σ each side
    kernel_x = np.arange(-kernel_width, kernel_width + 1)
    kernel = np.exp(-0.5 * (kernel_x * resolution_s / DUTY_SIGMA_S) ** 2)
    kernel /= kernel.sum()

    # Convolve
    smoothed = np.convolve(step_fn, kernel, mode='same')

    # Sample at DUTY_STEP_S intervals
    sample_step = int(DUTY_STEP_S / resolution_s)
    times_out = []
    duty_out = []
    for idx in range(0, n_steps, sample_step):
        t = t_start + timedelta(seconds=idx * resolution_s)
        times_out.append(t)
        duty_out.append(smoothed[idx])

    return times_out, duty_out

duty_times, duty_values = compute_continuous_duty()
print(f"Continuous duty: {len(duty_times)} samples")

# Also keep hourly buckets for the scatter fit
heat_buckets = []
bucket_centers = []
if len(state_times) >= 2:
    first_hour = state_times[0].replace(minute=0, second=0, microsecond=0)
    last_hour = state_times[-1].replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    hour = first_hour
    while hour < last_hour:
        next_hour = hour + timedelta(hours=1)
        heat_secs = 0.0

        for i in range(len(state_times)):
            state = state_vals[i]
            t_start_s = state_times[i]
            t_end_seg = state_times[i + 1] if i + 1 < len(state_times) else next_hour

            seg_start = max(t_start_s, hour)
            seg_end = min(t_end_seg, next_hour)
            if seg_start >= seg_end:
                continue

            duration = (seg_end - seg_start).total_seconds()
            if state == 1:
                heat_secs += duration

        bucket_secs = (next_hour - hour).total_seconds()
        heat_buckets.append(heat_secs / bucket_secs)
        bucket_centers.append((hour + timedelta(minutes=30)).astimezone(mtn))
        hour = next_hour

# --- Filter data to steady-state segments only ---
def filter_to_segments(data, segments):
    """Keep only data points that fall within one of the segments."""
    result = []
    for t, v in data:
        for seg_start, seg_end in segments:
            if seg_start <= t <= seg_end:
                result.append((t, v))
                break
    return result

def filter_buckets_to_segments(centers, values, segments):
    """Keep only duty cycle buckets within segments."""
    filtered_c, filtered_v = [], []
    for c, v in zip(centers, values):
        # bucket_centers are in mtn, segments are UTC — compare as UTC
        c_utc = c.astimezone(None)
        for seg_start, seg_end in segments:
            if seg_start <= c_utc <= seg_end:
                filtered_c.append(c)
                filtered_v.append(v)
                break
    return filtered_c, filtered_v

# --- ODE heating model ---
# dT/dt = (Q/C) × duty(t) - k × (T - T_outside(t))
# k known from cooling fit, C is the free parameter, UA = k × C
from scipy.optimize import least_squares

Q_FURNACE = 42000  # BTU/hr, low fire output
COOLING_K = {
    58: 0.0440,  # top floor, from cooling_curve_fit
    61: 0.0366,  # kitchen, from cooling_curve_fit
}

def get_duty_at(t):
    """Interpolate continuous duty at time t."""
    if not duty_times:
        return 0.0
    # Binary search
    lo, hi = 0, len(duty_times) - 1
    if t <= duty_times[0]:
        return duty_values[0]
    if t >= duty_times[-1]:
        return duty_values[-1]
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if duty_times[mid] <= t:
            lo = mid
        else:
            hi = mid
    # Linear interpolation
    dt_span = (duty_times[hi] - duty_times[lo]).total_seconds()
    if dt_span == 0:
        return duty_values[lo]
    frac = (t - duty_times[lo]).total_seconds() / dt_span
    return duty_values[lo] + frac * (duty_values[hi] - duty_values[lo])

def get_outside_temp_at(t):
    """Nearest outside temp reading to time t."""
    if not outside:
        return 45.0
    best = min(outside, key=lambda x: abs((x[0] - t).total_seconds()))
    return best[1]

def solve_heating_ode(indoor_data, seg, k, C):
    """Solve dT/dt = (Q/C)*duty(t) - k*(T - T_out(t)) using piecewise-constant exact solution.

    With heat input, the ODE becomes: dT/dt = -k*(T - T_eff) where
    T_eff = T_outside + (Q*duty)/(k*C) = T_outside + Q*duty/UA
    """
    C = float(np.asarray(C).flat[0])
    # Use indoor sensor readings as observation times
    obs = [(t, v) for t, v in indoor_data if seg[0] <= t <= seg[1]]
    if len(obs) < 2:
        return [], []

    predicted = [obs[0][1]]
    for i in range(1, len(obs)):
        dt_h = (obs[i][0] - obs[i-1][0]).total_seconds() / 3600
        T_out = get_outside_temp_at(obs[i-1][0])
        duty = get_duty_at(obs[i-1][0])
        T_eff = T_out + (Q_FURNACE * duty) / (k * C)
        T_prev = predicted[-1]
        T_next = T_eff + (T_prev - T_eff) * np.exp(-k * dt_h)
        predicted.append(T_next)

    return obs, np.array(predicted, dtype=float)

def fit_heating_C(indoor_data, segments, k):
    """Fit C across all segments by minimizing ODE prediction error."""
    def residuals(C):
        err = []
        for seg in segments:
            obs, predicted = solve_heating_ode(indoor_data, seg, k, C)
            if len(obs) > 0:
                observed = np.array([v for _, v in obs])
                err.extend(predicted - observed)
        return np.array(err)

    result = least_squares(residuals, x0=10000, bounds=(100, np.inf))
    return result.x[0]

# --- Plot ---
seg_colors = plt.cm.tab10(np.linspace(0, 1, max(len(steady_segments), 1)))
bar_width = timedelta(minutes=50)

panels = [
    (top_floor, "Top Floor (Brent's Office)", 58),
    (kitchen, "Kitchen (Thermostat)", 61),
]

fig, axes = plt.subplots(2, 2, figsize=(14, 11), height_ratios=[1, 1])

for col, (indoor_data, label, node_id) in enumerate(panels):
    # --- Top row: ODE fit (normalized) ---
    ax_top = axes[0, col]
    k = COOLING_K[node_id]
    C = fit_heating_C(indoor_data, steady_segments, k)
    UA = k * C
    tau = 1 / k
    half_life = np.log(2) / k

    # R² across all segments (on ΔT)
    all_obs_dt = []
    all_pred_dt = []
    for seg in steady_segments:
        obs, predicted = solve_heating_ode(indoor_data, seg, k, C)
        if len(obs) > 0:
            for i, (t, v) in enumerate(obs):
                t_out = get_outside_temp_at(t)
                all_obs_dt.append(v - t_out)
                all_pred_dt.append(predicted[i] - t_out)
    all_obs_dt = np.array(all_obs_dt)
    all_pred_dt = np.array(all_pred_dt)
    ss_res = np.sum((all_obs_dt - all_pred_dt) ** 2)
    ss_tot = np.sum((all_obs_dt - np.mean(all_obs_dt)) ** 2)
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0

    # Plot each segment: observed ΔT + predicted ΔT
    for si, seg in enumerate(steady_segments):
        obs, predicted = solve_heating_ode(indoor_data, seg, k, C)
        if len(obs) < 2:
            continue
        times_mtn = [t.astimezone(mtn) for t, _ in obs]
        obs_dt = [v - get_outside_temp_at(t) for t, v in obs]
        pred_dt = [p - get_outside_temp_at(obs[i][0]) for i, p in enumerate(predicted)]
        c = seg_colors[si]
        ax_top.plot(times_mtn, obs_dt, 'o', color=c,
                    markersize=3, alpha=0.6, label=f'Seg {si+1}')
        ax_top.plot(times_mtn, pred_dt, '-', color=c,
                    linewidth=1.5, alpha=0.6)

    stats = (
        f'dT/dt = (Q/C)·duty − k·(T−T_out)\n'
        f'k = {k:.4f} /hr (from cooling)\n'
        f'C = {C:.0f} BTU/°F\n'
        f'UA = k·C = {UA:.0f} BTU/hr·°F\n'
        f'R² = {r_squared:.3f}'
    )
    ax_top.text(0.97, 0.97, stats, transform=ax_top.transAxes, fontsize=9,
                verticalalignment='top', horizontalalignment='right',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    ax_top.set_title(label, fontsize=13, fontweight='bold')
    ax_top.set_xlabel('Date/Time', fontsize=11)
    ax_top.set_ylabel('ΔT: Inside − Outside (°F)', fontsize=11)
    ax_top.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
    ax_top.xaxis.set_major_locator(mdates.DayLocator(tz=mtn))
    ax_top.tick_params(axis='x', rotation=30)
    ax_top.grid(True, alpha=0.3)
    ax_top.legend(fontsize=8, loc='lower left', ncol=2)

    print(f"  {label}: C = {C:.0f} BTU/°F, UA = {UA:.0f} BTU/hr·°F, R² = {r_squared:.3f}")

    # --- Bottom row: raw temps + duty on timeline ---
    ax_bot = axes[1, col]
    ax2 = ax_bot.twinx()

    for si, (seg_start, seg_end) in enumerate(steady_segments):
        s_out = [(t, v) for t, v in outside if seg_start <= t <= seg_end]
        s_in = [(t, v) for t, v in indoor_data if seg_start <= t <= seg_end]
        s_duty = [(t, v) for t, v in zip(duty_times, duty_values)
                  if seg_start <= t <= seg_end]

        c = seg_colors[si]
        ax_bot.plot([t.astimezone(mtn) for t, _ in s_out], [v for _, v in s_out],
                's-', color=c, linewidth=1, markersize=2, alpha=0.4)
        ax_bot.plot([t.astimezone(mtn) for t, _ in s_in], [v for _, v in s_in],
                'o-', color=c, linewidth=1.5, markersize=3, alpha=0.7,
                label=f'Seg {si+1}')
        if s_duty:
            ax2.fill_between([t.astimezone(mtn) for t, _ in s_duty],
                             [v * 100 for _, v in s_duty],
                             alpha=0.2, color=c)
            ax2.plot([t.astimezone(mtn) for t, _ in s_duty],
                     [v * 100 for _, v in s_duty],
                     '-', color=c, linewidth=1, alpha=0.4)

    ax2.set_ylim(0, 100)
    if col == 1:
        ax2.set_ylabel('Duty cycle (%)', fontsize=11, color='#e67e22')
        ax2.tick_params(axis='y', labelcolor='#e67e22')
    else:
        ax2.tick_params(axis='y', labelright=False)

    ax_bot.set_xlabel('Date/Time', fontsize=11)
    if col == 0:
        ax_bot.set_ylabel('Temperature (°F)', fontsize=11)
    ax_bot.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
    ax_bot.xaxis.set_major_locator(mdates.DayLocator(tz=mtn))
    ax_bot.tick_params(axis='x', rotation=30)
    ax_bot.grid(True, alpha=0.3)
    ax_bot.legend(fontsize=8, loc='upper right', ncol=2)

fig.suptitle('Steady-State Heating Analysis (4/01–4/07)', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig('heating_analysis.png', dpi=150, bbox_inches='tight')
print("Saved heating_analysis.png")
plt.show()
