#!/usr/bin/env python3
"""
Attic-to-office thermal coupling fit.

Fits a two-source ODE model for office temperature:

    dT_office/dt = a * (T_outdoor - T_office) + b * (T_attic - T_office)

where `a` is the outdoor coupling (walls/window/floor losses) and `b` is
the attic coupling (ceiling radiation + conduction + air leakage to attic).

Equivalent form with effective ambient and combined rate:
    dT/dt = (a+b) * (T_eff - T_office)
    T_eff = (a * T_outdoor + b * T_attic) / (a + b)
    k = a + b

Under piecewise-constant T_outdoor and T_attic across an interval:
    T_office(t + dt) = T_eff + (T_office(t) - T_eff) * exp(-k * dt)

The script automatically finds "clean" windows where attic is the only
significant heat source on the office:

  1. External inputs are quiet (HVAC operating state idle, WHF off,
     Brent's Fan off) for >= BUFFER_S seconds.
  2. T_attic > T_office  (attic is a heat source for office)
  3. T_outdoor < T_office  (outdoor is a heat sink, not source)
  4. T_kitchen < T_office and T_rachel < T_office  (no warmer interior
     room to pump heat through interior walls/stairwell)

Then propagates each segment forward via the exact piecewise-constant ODE
solution and fits (a, b) jointly with scipy.least_squares to minimize the
residuals between predicted and observed T_office at all sample times.

Run with N days look-back:
    ./attic_coupling_fit.py 30
"""

import sys
import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from collections import defaultdict
from datetime import timedelta
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')

# Node IDs (post-controller-migration; see MEMORY.md)
N_OFFICE  = 14   # Brent's Office Temp
N_RACHEL  = 15   # Rachel's Office Temp (basement)
N_KITCHEN = 6    # Kitchen thermostat (main floor)
N_OUTSIDE = 16   # Back Porch (outdoor reference)
N_ATTIC   = 10   # Attic Temp (Aeotec MultiSensor 6, deployed 2026-05-23)

# Z-Wave devices that constitute "external input"
N_WHF       = 19   # Whole-house fan
N_BRENT_FAN = 21   # Floor-to-floor transfer fan

# How long after a transition do we wait before considering it "clean"
BUFFER_S = 30 * 60

# Max gap between samples within a single segment
MAX_GAP_S = 90 * 60

# Require at least this many consecutive clean samples to count as a segment
MIN_SEG_POINTS = 3

# Look-back window in days
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 30

# ============================================================================
# Data load
# ============================================================================
conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

cur.execute("""
    SELECT node_id, time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id = ANY(%s)
      AND time > NOW() - (%s || ' days')::interval
    ORDER BY time
""", ([N_OFFICE, N_RACHEL, N_KITCHEN, N_OUTSIDE, N_ATTIC], DAYS))
temp_rows = cur.fetchall()

temps = defaultdict(list)
for nid, t, v in temp_rows:
    temps[nid].append((t, v))

LABELS = {
    N_OFFICE:  "Brent's Office",
    N_RACHEL:  "Rachel's Office",
    N_KITCHEN: "Kitchen",
    N_OUTSIDE: "Outdoor",
    N_ATTIC:   "Attic",
}
for nid in (N_OFFICE, N_RACHEL, N_KITCHEN, N_OUTSIDE, N_ATTIC):
    print(f"  Node {nid:2d} ({LABELS[nid]:>16s}): {len(temps[nid]):>5d} readings")

if len(temps[N_ATTIC]) == 0:
    print("\nNo attic data yet — wait for sensor to report and try again.")
    sys.exit(0)
if len(temps[N_OFFICE]) < 10:
    print("\nToo few office readings to fit. Need more data.")
    sys.exit(0)

# HVAC operating state (idle == 0, heating == 1, cooling == 2)
cur.execute("""
    SELECT time, value::text::int
    FROM events
    WHERE node_id = %s
      AND command_class = 66
      AND property = 'state'
      AND time > NOW() - (%s || ' days')::interval
    ORDER BY time
""", (N_KITCHEN, DAYS))
hvac_state_rows = cur.fetchall()

# Binary switches: WHF, Brent's Fan
cur.execute("""
    SELECT node_id, time, value::text
    FROM events
    WHERE command_class = 37
      AND property = 'currentValue'
      AND node_id = ANY(%s)
      AND time > NOW() - (%s || ' days')::interval
    ORDER BY time
""", ([N_WHF, N_BRENT_FAN], DAYS))
fan_rows = cur.fetchall()

conn.close()

def parse_bool(s):
    s = (s or '').strip().lower()
    return s == 'true' or s == '1'

fan_state_rows = defaultdict(list)
for nid, t, v in fan_rows:
    fan_state_rows[nid].append((t, parse_bool(v)))

print(f"\nState events: HVAC={len(hvac_state_rows)}, "
      f"WHF={len(fan_state_rows[N_WHF])}, Brent's Fan={len(fan_state_rows[N_BRENT_FAN])}")


# ============================================================================
# Step-function lookups
# ============================================================================
def latest_at(series, t, default=None):
    """Return most-recent value in `series` (list of (time, value)) at or before `t`."""
    last = default
    for st, sv in series:
        if st <= t:
            last = sv
        else:
            break
    return last


def transition_recent(series, t, buffer_s, is_on):
    """True if any 'on' transition occurred in the buffer window [t - buffer_s, t]."""
    cutoff = t - timedelta(seconds=buffer_s)
    for st, sv in series:
        if st > t:
            break
        if cutoff <= st <= t and is_on(sv):
            return True
    return False


# ============================================================================
# Build clean samples
# ============================================================================
samples = []  # list of (time, T_office, T_attic, T_outdoor, T_kitchen, T_rachel)

for t, T_office in temps[N_OFFICE]:
    T_attic   = latest_at(temps[N_ATTIC], t)
    T_outdoor = latest_at(temps[N_OUTSIDE], t)
    T_kitchen = latest_at(temps[N_KITCHEN], t)
    T_rachel  = latest_at(temps[N_RACHEL], t)

    if None in (T_attic, T_outdoor, T_kitchen, T_rachel):
        continue

    # External-input idle check (instantaneous + buffer)
    hvac = latest_at(hvac_state_rows, t, default=0)
    whf  = latest_at(fan_state_rows[N_WHF], t, default=False)
    bfan = latest_at(fan_state_rows[N_BRENT_FAN], t, default=False)
    if (hvac != 0) or whf or bfan:
        continue
    if transition_recent(hvac_state_rows, t, BUFFER_S, lambda v: v != 0):
        continue
    if transition_recent(fan_state_rows[N_WHF], t, BUFFER_S, lambda v: v):
        continue
    if transition_recent(fan_state_rows[N_BRENT_FAN], t, BUFFER_S, lambda v: v):
        continue

    # Thermal-condition check
    if not (T_attic > T_office
            and T_outdoor < T_office
            and T_kitchen < T_office
            and T_rachel  < T_office):
        continue

    samples.append((t, T_office, T_attic, T_outdoor, T_kitchen, T_rachel))

print(f"\nClean samples (all conditions met): {len(samples)}")
if len(samples) < MIN_SEG_POINTS:
    print("Not enough clean samples to fit. Need more hot nights with the office isolated.")
    sys.exit(0)


# ============================================================================
# Chain into segments (consecutive samples within MAX_GAP_S)
# ============================================================================
segments = []
current = []
for s in samples:
    if not current or (s[0] - current[-1][0]).total_seconds() <= MAX_GAP_S:
        current.append(s)
    else:
        if len(current) >= MIN_SEG_POINTS:
            segments.append(current)
        current = [s]
if len(current) >= MIN_SEG_POINTS:
    segments.append(current)

print(f"Segments (>= {MIN_SEG_POINTS} points within {MAX_GAP_S/60:.0f} min gap): {len(segments)}")
for i, seg in enumerate(segments):
    dur_h = (seg[-1][0] - seg[0][0]).total_seconds() / 3600
    print(f"  Seg {i+1}: {seg[0][0].astimezone(mtn):%m-%d %H:%M} "
          f"({dur_h:.1f}h, {len(seg)} pts, "
          f"office {seg[0][1]:.1f}→{seg[-1][1]:.1f}°F, "
          f"attic {seg[0][2]:.1f}→{seg[-1][2]:.1f}°F)")

if not segments:
    print("\nNo valid segments to fit.")
    sys.exit(0)


# ============================================================================
# ODE fit: propagate piecewise-constant exact solution, fit (a, b) jointly
# ============================================================================
from scipy.optimize import least_squares


def solve_ode_segment(seg, a, b):
    """Propagate dT/dt = a*(T_out - T) + b*(T_attic - T) across `seg`.

    Uses the exact solution under piecewise-constant T_out and T_attic
    (held at their seg[i-1] values across the interval ending at seg[i]).
    Starts from observed T_office at seg[0]; downstream predictions depend
    on previous predictions (compound forward-integration).
    """
    a = float(np.asarray(a).flat[0])
    b = float(np.asarray(b).flat[0])
    predicted = [seg[0][1]]
    for i in range(1, len(seg)):
        t_prev, _, T_a_prev, T_out_prev, _, _ = seg[i-1]
        t_curr = seg[i][0]
        dt = (t_curr - t_prev).total_seconds() / 3600
        T_prev = predicted[-1]
        k = a + b
        if k <= 1e-9:
            predicted.append(T_prev)
            continue
        T_eff = (a * T_out_prev + b * T_a_prev) / k
        T_next = T_eff + (T_prev - T_eff) * np.exp(-k * dt)
        predicted.append(T_next)
    return np.array(predicted, dtype=float)


def fit_ode(segments):
    """Joint fit of (a, b) by minimizing residuals across all segments."""
    def residuals(params):
        a, b = params
        err = []
        for seg in segments:
            predicted = solve_ode_segment(seg, a, b)
            observed = np.array([s[1] for s in seg])
            err.extend(predicted - observed)
        return np.array(err)

    # Bound a, b >= 0 — negative couplings are unphysical for this model
    result = least_squares(residuals, x0=[0.1, 0.1],
                           bounds=([0.0, 0.0], [np.inf, np.inf]))
    return result.x


a, b = fit_ode(segments)
print(f"\nODE fit complete. a = {a:.4f} /hr, b = {b:.4f} /hr")

# Compute R² across all segments (on raw temps via the propagated prediction)
all_observed, all_predicted = [], []
for seg in segments:
    pred = solve_ode_segment(seg, a, b)
    obs = np.array([s[1] for s in seg])
    all_observed.extend(obs)
    all_predicted.extend(pred)
all_observed = np.array(all_observed)
all_predicted = np.array(all_predicted)
ss_res = np.sum((all_observed - all_predicted) ** 2)
ss_tot = np.sum((all_observed - np.mean(all_observed)) ** 2)
r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

k = a + b
print()
print("=" * 60)
print(f"  Model: dT_office/dt = a*(T_outdoor - T_office) + b*(T_attic - T_office)")
print(f"  a (outdoor coupling) = {a:.4f} /hr"
      + (f"   (τ_out = {1/a:.1f} hr)" if a > 1e-6 else "   (at lower bound)"))
print(f"  b (attic coupling)   = {b:.4f} /hr"
      + (f"   (τ_attic = {1/b:.1f} hr)" if b > 1e-6 else "   (at lower bound)"))
print(f"  k = a + b            = {k:.4f} /hr   (combined τ = {1/k:.1f} hr)" if k > 1e-6
      else "  k = a + b is degenerate")
if a > 1e-6 and b > 1e-6:
    print(f"  b/a (attic dominance) = {b/a:.2f}")
    print(f"  → For each 1°F of attic-office gap, office gains {b:.3f}°F/hr from attic")
    print(f"  → For each 1°F of office-outdoor gap, office loses {a:.3f}°F/hr to outdoor")
print(f"  R² = {r2:.3f}   (on raw T_office, n = {len(all_observed)})")
print("=" * 60)


# ============================================================================
# Plot
# ============================================================================
fig, axes = plt.subplots(3, 1, figsize=(14, 12), height_ratios=[2, 1.2, 1.2])

# --- Row 1: time series of all temps; observed office overlaid with ODE prediction ---
ax = axes[0]
colors = {N_OFFICE: '#e74c3c', N_RACHEL: '#3498db',
          N_KITCHEN: '#2ecc71', N_OUTSIDE: '#95a5a6',
          N_ATTIC: '#f1c40f'}
for nid in (N_OFFICE, N_RACHEL, N_KITCHEN, N_OUTSIDE, N_ATTIC):
    if not temps[nid]:
        continue
    ts = [t.astimezone(mtn) for t, _ in temps[nid]]
    vs = [v for _, v in temps[nid]]
    ax.plot(ts, vs, '-', color=colors[nid], linewidth=1.2,
            alpha=0.6, label=LABELS[nid])

# Overlay ODE predictions on observed office temps within each segment
for i, seg in enumerate(segments):
    pred = solve_ode_segment(seg, a, b)
    ts = [s[0].astimezone(mtn) for s in seg]
    ax.plot(ts, pred, 'o-', color='#8e44ad', markersize=4, linewidth=1.5,
            alpha=0.95,
            label='ODE prediction' if i == 0 else None)

# Highlight clean segments
for i, seg in enumerate(segments):
    seg_start = seg[0][0].astimezone(mtn)
    seg_end = seg[-1][0].astimezone(mtn)
    ax.axvspan(seg_start, seg_end, color='wheat', alpha=0.35,
               label='Clean segment' if i == 0 else None)

ax.set_ylabel('Temperature (°F)', fontsize=11)
ax.set_title('Attic-to-Office Thermal Coupling — ODE Fit (purple) on Clean Segments',
             fontsize=13, fontweight='bold')
ax.grid(True, alpha=0.3)
ax.legend(fontsize=9, loc='upper left', ncol=3)
ax.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
ax.tick_params(axis='x', rotation=20)

# --- Row 2: fit quality — ODE-predicted T_office vs observed T_office ---
ax = axes[1]
ax.scatter(all_predicted, all_observed, s=18, alpha=0.55, color='#8e44ad')
lim_min = min(all_observed.min(), all_predicted.min())
lim_max = max(all_observed.max(), all_predicted.max())
ax.plot([lim_min, lim_max], [lim_min, lim_max], 'k--', alpha=0.5, label='y = x')
ax.set_xlabel('Predicted T_office (°F)', fontsize=11)
ax.set_ylabel('Observed T_office (°F)', fontsize=11)
ax.set_title(f'ODE fit quality: R² = {r2:.3f}, n = {len(all_observed)}', fontsize=12)
ax.grid(True, alpha=0.3)
ax.legend(fontsize=9)

# --- Row 3: term contributions to dT/dt at each sample in clean segments ---
ax = axes[2]
sample_times, attic_terms, outdoor_terms, net_terms = [], [], [], []
for seg in segments:
    for s in seg:
        t, T_o, T_a, T_out, _, _ = s
        attic_terms.append(b * (T_a - T_o))
        outdoor_terms.append(a * (T_out - T_o))
        net_terms.append(b * (T_a - T_o) + a * (T_out - T_o))
        sample_times.append(t.astimezone(mtn))
ax.scatter(sample_times, attic_terms, s=14, alpha=0.7,
           color=colors[N_ATTIC], label=f'attic in: b·(T_attic−T_office)')
ax.scatter(sample_times, outdoor_terms, s=14, alpha=0.7,
           color=colors[N_OUTSIDE], label=f'outdoor out: a·(T_out−T_office)')
ax.scatter(sample_times, net_terms, s=14, alpha=0.85,
           color='#8e44ad', marker='x', label='net dT/dt (sum)')
ax.axhline(0, color='gray', linestyle='--', alpha=0.5)
ax.set_ylabel('Predicted dT/dt (°F/hr)', fontsize=11)
ax.set_xlabel('Date/Time', fontsize=11)
ax.set_title('Per-sample term contributions across clean segments', fontsize=12)
ax.grid(True, alpha=0.3)
ax.legend(fontsize=9, loc='best')
ax.xaxis.set_major_formatter(mdates.DateFormatter('%-m/%d %H:%M', tz=mtn))
ax.tick_params(axis='x', rotation=20)

plt.tight_layout()
plt.savefig('attic_coupling_fit.png', dpi=150, bbox_inches='tight')
print("\nSaved attic_coupling_fit.png")
plt.show()
