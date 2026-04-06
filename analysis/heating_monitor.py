#!/usr/bin/env python3
"""Plot temperature data with dead band and HVAC duty cycle."""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from astral import LocationInfo
from astral.sun import sun

mtn = ZoneInfo('America/Denver')

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

# All 4 temp sensors
cur.execute("""
    SELECT node_id, time, value::text::float
    FROM events
    WHERE node_id IN (58, 59, 60, 61, 62)
      AND property = 'Air temperature'
      AND time > NOW() - INTERVAL '7 days'
    ORDER BY time
""")
temp_rows = cur.fetchall()

# Thermostat operating state (CC 66): 0=Idle, 1=Heating, 2=Cooling
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

# Fan mode (CC 68): 0=Auto Low, 6=Circulation — tracks when plugin enables circ fan
cur.execute("""
    SELECT time, value::text::int
    FROM events
    WHERE node_id = 61
      AND property = 'mode'
      AND command_class = 68
      AND time > NOW() - INTERVAL '7 days'
    ORDER BY time
""")
fan_mode_rows = cur.fetchall()

# Dead band thresholds from plugin config
cur.execute("""
    SELECT config->>'heat_below', config->>'cool_above'
    FROM plugins
    WHERE type = 'hvac-mode' AND enabled = true
    LIMIT 1
""")
row = cur.fetchone()
heat_below = float(row[0]) if row else 62
cool_above = float(row[1]) if row else 74

conn.close()

# Split by node
top = [(r[1].astimezone(mtn), r[2]) for r in temp_rows if r[0] == 58]
basement = [(r[1].astimezone(mtn), r[2]) for r in temp_rows if r[0] == 59]
outside = [(r[1].astimezone(mtn), r[2]) for r in temp_rows if r[0] == 60]
thermostat = [(r[1].astimezone(mtn), r[2]) for r in temp_rows if r[0] == 61]
brood = [(r[1].astimezone(mtn), r[2]) for r in temp_rows if r[0] == 62]
states = [(r[0].astimezone(mtn), r[1]) for r in state_rows]
fan_modes = [(r[0].astimezone(mtn), r[1]) for r in fan_mode_rows]

fig, ax = plt.subplots(figsize=(18, 7))

# Temperature lines (no fill)
ax.plot([t for t, _ in top], [v for _, v in top],
        marker='o', markersize=3, linewidth=2, color='#e74c3c',
        label="Brent's Office (Top)")
ax.plot([t for t, _ in basement], [v for _, v in basement],
        marker='o', markersize=3, linewidth=2, color='#3498db',
        label="Rachel's Office (Basement)")
ax.plot([t for t, _ in thermostat], [v for _, v in thermostat],
        marker='o', markersize=3, linewidth=2, color='#2ecc71',
        label="Kitchen (Thermostat)")
ax.plot([t for t, _ in outside], [v for _, v in outside],
        marker='o', markersize=3, linewidth=2, color='#95a5a6',
        label="Back Porch (Outside)")
ax.plot([t for t, _ in brood], [v for _, v in brood],
        marker='o', markersize=3, linewidth=2, color='#f39c12',
        label="Brood (Basement)")

# Dead band horizontal lines
ax.axhline(y=heat_below, color='#e74c3c', linestyle='--', linewidth=1, alpha=0.6,
           label=f'Heat below {heat_below:.0f}°F')
ax.axhline(y=cool_above, color='#3498db', linestyle='--', linewidth=1, alpha=0.6,
           label=f'Cool above {cool_above:.0f}°F')

# Dead band exceedance fill — shade between sensor and nearest threshold it exceeds
for series, color in [(top, '#e74c3c'), (basement, '#3498db'),
                      (thermostat, '#2ecc71')]:
    if not series:
        continue
    t_vals = [t for t, _ in series]
    v_vals = [v for _, v in series]
    ax.fill_between(t_vals, v_vals, cool_above, where=[v > cool_above for v in v_vals],
                    interpolate=True, alpha=0.15, color=color)
    ax.fill_between(t_vals, v_vals, heat_below, where=[v < heat_below for v in v_vals],
                    interpolate=True, alpha=0.15, color=color)

# Hour-aligned duty cycle buckets on secondary y-axis
has_duty_data = states or fan_modes
if has_duty_data:
    ax2 = ax.twinx()
    times = [t for t, _ in states]
    vals = [s for _, s in states]

    if len(times) >= 2:
        # Find hour-aligned bucket boundaries spanning all state data
        first_hour = times[0].replace(minute=0, second=0, microsecond=0)
        last_hour = times[-1].replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

        heat_buckets = []
        cool_buckets = []
        bucket_centers = []
        hour = first_hour
        while hour < last_hour:
            next_hour = hour + timedelta(hours=1)
            heat_secs = 0.0
            cool_secs = 0.0

            # Walk state transitions, accumulate time in this bucket
            for i in range(len(times)):
                state = vals[i]
                t_start = times[i]
                t_end_seg = times[i + 1] if i + 1 < len(times) else next_hour

                # Clip segment to this bucket
                seg_start = max(t_start, hour)
                seg_end = min(t_end_seg, next_hour)
                if seg_start >= seg_end:
                    continue

                duration = (seg_end - seg_start).total_seconds()
                if state == 1:
                    heat_secs += duration
                elif state == 2:
                    cool_secs += duration

            bucket_secs = (next_hour - hour).total_seconds()
            heat_buckets.append(heat_secs / bucket_secs)
            cool_buckets.append(cool_secs / bucket_secs)
            bucket_centers.append(hour + timedelta(minutes=30))
            hour = next_hour

        bar_width = timedelta(minutes=50)
        if any(v > 0 for v in heat_buckets):
            ax2.bar(bucket_centers, heat_buckets, width=bar_width, alpha=0.35,
                    color='#e67e22', label='Heating %')
        if any(v > 0 for v in cool_buckets):
            ax2.bar(bucket_centers, cool_buckets, width=bar_width, alpha=0.35,
                    color='#2980b9', label='Cooling %')

    # Circ fan duty cycle — same bucket logic, fan mode 6 = Circulation is "on"
    if fan_modes:
        fm_times = [t for t, _ in fan_modes]
        fm_vals = [m for _, m in fan_modes]

        if len(fm_times) >= 2:
            fm_first = fm_times[0].replace(minute=0, second=0, microsecond=0)
            fm_last = fm_times[-1].replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

            fan_buckets = []
            fan_centers = []
            hour = fm_first
            while hour < fm_last:
                next_hour = hour + timedelta(hours=1)
                circ_secs = 0.0

                for i in range(len(fm_times)):
                    t_start = fm_times[i]
                    t_end_seg = fm_times[i + 1] if i + 1 < len(fm_times) else next_hour

                    seg_start = max(t_start, hour)
                    seg_end = min(t_end_seg, next_hour)
                    if seg_start >= seg_end:
                        continue

                    if fm_vals[i] == 6:  # Circulation
                        circ_secs += (seg_end - seg_start).total_seconds()

                bucket_secs = (next_hour - hour).total_seconds()
                fan_buckets.append(circ_secs / bucket_secs)
                fan_centers.append(hour + timedelta(minutes=30))
                hour = next_hour

            if any(v > 0 for v in fan_buckets):
                ax2.bar(fan_centers, fan_buckets, width=bar_width, alpha=0.35,
                        color='#27ae60', label='Circ Fan %')

    ax2.set_ylim(-0.02, 1.05)
    ax2.set_ylabel('Duty Cycle %', fontsize=12)
    ax2.set_yticks([0, 0.25, 0.5, 0.75, 1.0])
    ax2.set_yticklabels(['0%', '25%', '50%', '75%', '100%'], fontsize=10)

ax.set_title('Temperature Monitoring — All Zones + Duty Cycle', fontsize=16, fontweight='bold')
ax.set_xlabel('Time', fontsize=12)
ax.set_ylabel('Temperature (°F)', fontsize=12)

ax.grid(True, alpha=0.3)

# Midnight and sunrise/sunset vertical lines
fc = LocationInfo("Fort Collins", "USA", "America/Denver", 40.585, -105.084)
all_times = ([t for t, _ in top] + [t for t, _ in basement] +
             [t for t, _ in outside] + [t for t, _ in thermostat] +
             [t for t, _ in brood])
if all_times:
    first_day = min(all_times).date()
    last_day = max(all_times).date()
    day = first_day - timedelta(days=1)  # start a day early to catch previous night
    last = last_day + timedelta(days=1)
    first_night = True
    while day <= last:
        s = sun(fc.observer, date=day, tzinfo=mtn)
        s_next = sun(fc.observer, date=day + timedelta(days=1), tzinfo=mtn)
        # Shade from sunset to next sunrise
        ax.axvspan(s['sunset'], s_next['sunrise'], alpha=0.15, color='#888888',
                   label='Night' if first_night else None)
        first_night = False
        if day > first_day:
            midnight = datetime(day.year, day.month, day.day, tzinfo=mtn)
            ax.axvline(x=midnight, color='white', linestyle='-', linewidth=0.8, alpha=0.4)
        day += timedelta(days=1)

# Combined legend (after sun lines so they're included)
lines1, labels1 = ax.get_legend_handles_labels()
if has_duty_data:
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax.legend(lines1 + lines2, labels1 + labels2, fontsize=10, loc='upper left')
else:
    ax.legend(fontsize=10, loc='upper left')

# Determine tick interval based on data span
span_hours = (max(all_times) - min(all_times)).total_seconds() / 3600 if all_times else 24
if span_hours > 120:
    tick_interval = 12
elif span_hours > 72:
    tick_interval = 6
elif span_hours > 36:
    tick_interval = 4
else:
    tick_interval = 2

ax.xaxis.set_major_formatter(mdates.DateFormatter('%a %H:%M', tz=mtn))
ax.xaxis.set_major_locator(mdates.HourLocator(interval=tick_interval, tz=mtn))
now_mtn = datetime.now(mtn)
ax.set_xlim(now_mtn - timedelta(days=7), now_mtn)
fig.autofmt_xdate()

plt.tight_layout()
plt.show()
