#!/usr/bin/env python3
"""
Multi-segment cooling curve fit.

1. Query indoor temps and furnace operating state for the last 7 days
2. Filter out all temp readings where the furnace was running
3. From remaining data, find declining-temp segments (>=2°F drop)
4. Normalize and stitch into a universal decay curve, fit exp(-k*t)
"""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt
from collections import defaultdict
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')
MIN_DROP_F = 2.0       # minimum temp drop to count as a cooling segment
MIN_POINTS = 3         # minimum readings in a segment
MAX_SEGMENT_H = 12.0   # truncate segments at this many hours

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
T_outside_mean = np.mean([v for _, v in outside_temps]) if outside_temps else 45.0
print(f"T_outside 7-day mean: {T_outside_mean:.1f}°F ({len(outside_temps)} readings)")

# --- Furnace operating state (node 61, CC 66) ---
# State changes give us a step function: each row is "state was X from this time onward"
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

# --- Indoor temp data ---
cur.execute("""
    SELECT node_id, time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id IN (58, 59, 61)
      AND time > NOW() - INTERVAL '7 days'
    ORDER BY node_id, time
""")
temp_rows = cur.fetchall()
conn.close()


IDLE_BUFFER_S = 30 * 60  # require 30 min of continuous idle around a reading

def build_idle_intervals():
    """Build list of (start, end) intervals where furnace was idle."""
    intervals = []
    seg_start = None
    for i, (time, state) in enumerate(state_rows):
        if state == 0:
            if seg_start is None:
                seg_start = time
        else:
            if seg_start is not None:
                intervals.append((seg_start, time))
                seg_start = None
    if seg_start is not None:
        intervals.append((seg_start, state_rows[-1][0]))
    return intervals

idle_intervals = build_idle_intervals()
print(f"Idle intervals: {len(idle_intervals)}")

def furnace_idle_at(t):
    """Check if furnace was continuously idle for IDLE_BUFFER_S around time t.

    The furnace cycles on/off every ~5 min during heating, so a point-in-time
    check would pass readings that land in brief idle gaps between cycles.
    Requiring 30 min of continuous idle ensures we're in a true off period.
    """
    from datetime import timedelta
    buf = timedelta(seconds=IDLE_BUFFER_S)
    for start, end in idle_intervals:
        if start <= t - buf and t + buf <= end:
            return True
    return False


def get_outside_temp_at(t):
    """Nearest outside temp reading to time t."""
    if not outside_temps:
        return T_outside_mean
    best = min(outside_temps, key=lambda x: abs((x[0] - t).total_seconds()))
    return best[1]


# --- Step 1: Filter temp data to furnace-idle only ---
node_temps = defaultdict(list)
for node_id, time, value in temp_rows:
    if furnace_idle_at(time):
        node_temps[node_id].append((time, value))

for nid in sorted(node_temps):
    total = sum(1 for n, _, _ in temp_rows if n == nid)
    print(f"Node {nid}: {len(node_temps[nid])}/{total} readings during furnace idle")


def _time_truncate(seg):
    """Truncate a segment to MAX_SEGMENT_H from its start."""
    if not seg:
        return seg
    t0 = seg[0][0]
    return [(t, v) for t, v in seg
            if (t - t0).total_seconds() / 3600 <= MAX_SEGMENT_H]

# --- Step 2: Find declining-temp segments ---
def find_cooling_segments(pts):
    """Split idle-only temp readings into segments of declining temp.

    Collects points while temp is falling or flat (within noise). When temp
    rises above the running minimum by >= 1°F, truncates the segment at
    the minimum (removing the upswing) and starts a new segment.
    """
    if len(pts) < MIN_POINTS:
        return []

    segments = []
    seg = [pts[0]]
    running_min = pts[0][1]
    min_idx = 0  # index of minimum temp in current segment

    for t, v in pts[1:]:
        if v <= running_min + 1.0:
            seg.append((t, v))
            if v <= running_min:
                running_min = v
                min_idx = len(seg) - 1
        else:
            # Temp rose — truncate at the minimum, discard the upswing
            truncated = _time_truncate(seg[:min_idx + 1])
            if len(truncated) >= MIN_POINTS:
                drop = truncated[0][1] - truncated[-1][1]
                if drop >= MIN_DROP_F:
                    segments.append(truncated)
            seg = [(t, v)]
            running_min = v
            min_idx = 0

    # Final segment — also truncate at minimum
    truncated = _time_truncate(seg[:min_idx + 1])
    if len(truncated) >= MIN_POINTS:
        drop = truncated[0][1] - truncated[-1][1]
        if drop >= MIN_DROP_F:
            segments.append(truncated)

    return segments


# --- Step 3: Build segments and ODE solver ---
def get_segments(node_id):
    """Get cooling segments for a node."""
    return find_cooling_segments(node_temps[node_id])


def solve_ode_segment(seg, k):
    """Solve dT/dt = -k(T - T_outside(t)) using exact piecewise-constant solution."""
    k = float(np.asarray(k).flat[0])
    predicted = [seg[0][1]]
    for i in range(1, len(seg)):
        dt = (seg[i][0] - seg[i-1][0]).total_seconds() / 3600
        T_out = get_outside_temp_at(seg[i-1][0])
        T_prev = predicted[-1]
        T_next = T_out + (T_prev - T_out) * np.exp(-k * dt)
        predicted.append(T_next)
    return np.array(predicted, dtype=float)


def fit_ode(segments):
    """Fit k across all segments by minimizing ODE prediction error."""
    def residuals(k):
        err = []
        for seg in segments:
            predicted = solve_ode_segment(seg, k)
            observed = np.array([v for _, v in seg])
            err.extend(predicted - observed)
        return np.array(err)

    from scipy.optimize import least_squares
    result = least_squares(residuals, x0=0.05, bounds=(0, np.inf))
    return result.x[0]


def decay(t, k):
    return np.exp(-k * t)


# --- Plot ---
nodes = [
    (58, "Top Floor (Brent's Office)", '#e74c3c'),
    (61, "Kitchen (Thermostat)", '#2ecc71'),
]

import matplotlib.dates as mdates

fig, axes = plt.subplots(3, 2, figsize=(14, 14),
                         height_ratios=[1, 1, 1])

for col, (node_id, label, color) in enumerate(nodes):
    ax_top = axes[0, col]
    ax_bot = axes[1, col]
    segments = get_segments(node_id)

    if len(segments) < 1:
        ax_top.set_title(f'{label}\n(insufficient data)', fontsize=12)
        ax_bot.set_visible(False)
        continue

    # Fit ODE with variable ambient
    k = fit_ode(segments)
    tau = 1 / k
    half_life = np.log(2) / k

    # R² across all segments (on raw temps)
    all_observed = []
    all_predicted = []
    for seg in segments:
        predicted = solve_ode_segment(seg, k)
        observed = np.array([v for _, v in seg])
        all_observed.extend(observed)
        all_predicted.extend(predicted)
    all_observed = np.array(all_observed)
    all_predicted = np.array(all_predicted)
    ss_res = np.sum((all_observed - all_predicted) ** 2)
    ss_tot = np.sum((all_observed - np.mean(all_observed)) ** 2)
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0

    # --- Top row: normalized with mean T_out, ODE prediction also normalized ---
    seg_colors = plt.cm.tab10(np.linspace(0, 1, max(len(segments), 1)))
    for i, seg in enumerate(segments):
        T0 = seg[0][1]
        t0 = seg[0][0]
        T_out_mean = np.mean([get_outside_temp_at(t) for t, _ in seg])
        denom = T0 - T_out_mean
        if abs(denom) < 1.0:
            continue
        elapsed_h = [(t - t0).total_seconds() / 3600 for t, _ in seg]
        obs_norm = [(v - T_out_mean) / denom for _, v in seg]
        predicted = solve_ode_segment(seg, k)
        pred_norm = [(p - T_out_mean) / denom for p in predicted]

        ax_top.plot(elapsed_h, obs_norm, 'o', color=seg_colors[i],
                    markersize=3, alpha=0.6, label=f'Seg {i+1}')
        ax_top.plot(elapsed_h, pred_norm, '-', color=seg_colors[i],
                    linewidth=1.5, alpha=0.6)

    ax_top.set_title(f'{label}', fontsize=13, fontweight='bold')
    ax_top.set_xlabel('Elapsed hours (from segment start)', fontsize=11)
    ax_top.set_ylabel('(T − T̄_out) / (T₀ − T̄_out)', fontsize=11)
    ax_top.grid(True, alpha=0.3)
    ax_top.set_ylim(-0.05, 1.15)

    stats = (
        f'ODE: dT/dt = −k(T−T_out(t))\n'
        f'k = {k:.4f} /hr\n'
        f'τ = {tau:.1f} hrs\n'
        f'Half-life = {half_life:.1f} hrs\n'
        f'R² = {r_squared:.3f}\n'
        f'Segments: {len(segments)}'
    )
    ax_top.text(0.97, 0.97, stats, transform=ax_top.transAxes, fontsize=10,
                verticalalignment='top', horizontalalignment='right',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    ax_top.legend(fontsize=8, loc='lower left', ncol=2)

    # --- Bottom row: raw temps on real timeline ---
    for i, seg in enumerate(segments):
        times = [t.astimezone(mtn) for t, _ in seg]
        temps = [v for _, v in seg]
        ax_bot.plot(times, temps, 'o-', color=seg_colors[i],
                    markersize=3, linewidth=1, alpha=0.6,
                    label=f'Seg {i+1}')

    # Outside temp — only during segment time ranges
    if outside_temps and segments:
        for seg in segments:
            seg_start = seg[0][0]
            seg_end = seg[-1][0]
            out_seg = [(t, v) for t, v in outside_temps
                       if seg_start <= t <= seg_end]
            if out_seg:
                ot = [t.astimezone(mtn) for t, _ in out_seg]
                ov = [v for _, v in out_seg]
                ax_bot.plot(ot, ov, '-', color='#3498db', linewidth=1.5,
                            alpha=0.6, label='Outside' if seg is segments[0] else None)

    ax_bot.set_xlabel('Date/Time', fontsize=11)
    ax_bot.set_ylabel('Temperature (°F)', fontsize=11)
    ax_bot.grid(True, alpha=0.3)
    ax_bot.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
    ax_bot.xaxis.set_major_locator(mdates.DayLocator(tz=mtn))
    ax_bot.tick_params(axis='x', rotation=30)
    ax_bot.legend(fontsize=8, loc='upper right', ncol=2)

    # --- Third row: ΔT (inside - mean outside for segment) ---
    ax_delta = axes[2, col]
    for i, seg in enumerate(segments):
        T_out_seg = np.mean([get_outside_temp_at(t) for t, _ in seg])
        delta_times = []
        delta_vals = []
        for t, v in seg:
            delta_times.append(t.astimezone(mtn))
            delta_vals.append(v - T_out_seg)
        ax_delta.plot(delta_times, delta_vals, 'o-', color=seg_colors[i],
                      markersize=3, linewidth=1, alpha=0.6,
                      label=f'Seg {i+1}')

    ax_delta.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
    ax_delta.set_xlabel('Date/Time', fontsize=11)
    ax_delta.set_ylabel('ΔT Inside−Mean Outside (°F)', fontsize=11)
    ax_delta.grid(True, alpha=0.3)
    ax_delta.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
    ax_delta.xaxis.set_major_locator(mdates.DayLocator(tz=mtn))
    ax_delta.tick_params(axis='x', rotation=30)
    ax_delta.legend(fontsize=8, loc='upper right', ncol=2)

    # Print segment details
    for i, seg in enumerate(segments):
        dur = (seg[-1][0] - seg[0][0]).total_seconds() / 3600
        drop = seg[0][1] - seg[-1][1]
        print(f"  {label} seg {i+1}: {seg[0][0].astimezone(mtn):%m-%d %H:%M} "
              f"({dur:.1f}h, {seg[0][1]:.1f}→{seg[-1][1]:.1f}°F, Δ{drop:.1f}°F)")

fig.suptitle('Multi-Segment Cooling Curve Fit — Newton\'s Law of Cooling',
             fontsize=15, fontweight='bold')
plt.tight_layout()
plt.savefig('cooling_curve_fit.png', dpi=150, bbox_inches='tight')
print("Saved cooling_curve_fit.png")
plt.show()
