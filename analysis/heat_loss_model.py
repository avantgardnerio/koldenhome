#!/usr/bin/env python3
"""Fit Newton's law of cooling to the heat-off period."""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')
T_outside = 33.0  # approximate average outside temp overnight

conn = psycopg2.connect(dbname="koldenhome", user="postgres", password="postgres")
cur = conn.cursor()
cur.execute("""
    SELECT node_id, time, value::text::float
    FROM events
    WHERE property = 'Air temperature'
      AND node_id IN (58, 59)
      AND time > '2026-03-27 20:00:00-06'
      AND time < '2026-03-28 05:00:00-06'
    ORDER BY node_id, time
""")
rows = cur.fetchall()
conn.close()

# Split by node, deduplicate, convert to hours since start
def prepare(node_id):
    pts = [(r[1].astimezone(mtn), r[2]) for r in rows if r[0] == node_id]
    # deduplicate close timestamps
    clean = [pts[0]]
    for t, v in pts[1:]:
        if (t - clean[-1][0]).total_seconds() > 600:
            clean.append((t, v))
    t0 = clean[0][0]
    hours = np.array([(t - t0).total_seconds() / 3600 for t, _ in clean])
    temps = np.array([v for _, v in clean])
    times = [t for t, _ in clean]
    return hours, temps, times, t0

# Newton's law of cooling: T(t) = T_env + (T0 - T_env) * exp(-k*t)
def cooling(t, k):
    return T_outside + (T0 - T_outside) * np.exp(-k * t)

fig, axes = plt.subplots(1, 2, figsize=(14, 6))

for ax, node_id, label, color in [
    (axes[0], 58, "Top Floor (Brent's Office)", '#e74c3c'),
    (axes[1], 59, "Basement (Rachel's Office)", '#3498db'),
]:
    hours, temps, times, t0 = prepare(node_id)
    T0 = temps[0]

    popt, _ = curve_fit(cooling, hours, temps, p0=[0.05])
    k = popt[0]

    # Time constant (hours to lose 63.2% of the delta)
    tau = 1 / k
    # Half-life
    half_life = np.log(2) / k
    # Loss rate at start (°F/hour)
    initial_rate = k * (T0 - T_outside)

    # Plot
    h_fit = np.linspace(0, hours[-1], 200)
    ax.plot(times, temps, 'o', color=color, markersize=5, label='Measured')
    fit_times = [t0 + __import__('datetime').timedelta(hours=h) for h in h_fit]
    ax.plot(fit_times, cooling(h_fit, k), '--', color=color, alpha=0.7, label='Model fit')

    ax.set_title(f'{label}', fontsize=13, fontweight='bold')
    ax.set_xlabel('Time', fontsize=11)
    ax.set_ylabel('Temperature (°F)', fontsize=11)
    ax.grid(True, alpha=0.3)

    ax.xaxis.set_major_formatter(mdates.DateFormatter('%-I %p', tz=mtn))
    ax.xaxis.set_major_locator(mdates.HourLocator(interval=2, tz=mtn))
    fig.autofmt_xdate()

    stats = (
        f'k = {k:.4f} /hr\n'
        f'τ = {tau:.1f} hrs\n'
        f'Half-life = {half_life:.1f} hrs\n'
        f'Initial loss = {initial_rate:.1f} °F/hr\n'
        f'T_outside ≈ {T_outside}°F'
    )
    ax.text(0.97, 0.97, stats, transform=ax.transAxes, fontsize=10,
            verticalalignment='top', horizontalalignment='right',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    ax.legend(fontsize=10, loc='lower left')

fig.suptitle('Heat Loss Model — Newton\'s Law of Cooling (Heat Off Period)', fontsize=15, fontweight='bold')
plt.tight_layout()
plt.show()
