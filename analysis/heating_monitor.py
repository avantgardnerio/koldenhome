#!/usr/bin/env python3
"""Plot temperature data with outdoor temp and thermostat duty cycle."""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from zoneinfo import ZoneInfo

mtn = ZoneInfo('America/Denver')

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

# Indoor temps (nodes 58, 59)
cur.execute("""
    SELECT node_id, time, value::text::float
    FROM events
    WHERE node_id IN (58, 59)
      AND property = 'Air temperature'
    ORDER BY time
""")
indoor_rows = cur.fetchall()

# Outdoor temp (node 60)
cur.execute("""
    SELECT time, value::text::float
    FROM events
    WHERE node_id = 60
      AND property = 'Air temperature'
    ORDER BY time
""")
outdoor_rows = cur.fetchall()

# Thermostat operating state (node 61): 0=Idle, 1=Heating, 2=Cooling
cur.execute("""
    SELECT time, value::text::int
    FROM events
    WHERE node_id = 61
      AND property = 'state'
    ORDER BY time
""")
state_rows = cur.fetchall()

conn.close()

top = [(r[1].astimezone(mtn), r[2]) for r in indoor_rows if r[0] == 58]
basement = [(r[1].astimezone(mtn), r[2]) for r in indoor_rows if r[0] == 59]
outside = [(r[0].astimezone(mtn), r[1]) for r in outdoor_rows]
states = [(r[0].astimezone(mtn), r[1]) for r in state_rows]

fig, ax = plt.subplots(figsize=(14, 7))

# Temperature lines
ax.plot([t for t, _ in top], [v for _, v in top],
        marker='o', markersize=3, linewidth=2, color='#e74c3c',
        label="Brent's Office (Top Floor)")
ax.plot([t for t, _ in basement], [v for _, v in basement],
        marker='o', markersize=3, linewidth=2, color='#3498db',
        label="Rachel's Office (Basement)")
ax.plot([t for t, _ in outside], [v for _, v in outside],
        marker='o', markersize=3, linewidth=2, color='#95a5a6',
        label="Back Porch (Outside)")

# Duty cycle as step plot on secondary y-axis
if states:
    ax2 = ax.twinx()
    ax2.fill_between([t for t, _ in states], [s for _, s in states],
                     step='post', alpha=0.25, color='#e67e22', label='Furnace Heating')
    ax2.step([t for t, _ in states], [s for _, s in states],
             where='post', color='#e67e22', linewidth=1.5, alpha=0.6)
    ax2.set_ylim(-0.05, 1.05)
    ax2.set_ylabel('Furnace State', fontsize=12, color='#e67e22')
    ax2.set_yticks([0, 1])
    ax2.set_yticklabels(['Off', 'On'], fontsize=10, color='#e67e22')
    ax2.tick_params(axis='y', colors='#e67e22')

ax.set_title('Temperature Monitoring — All Zones + Duty Cycle', fontsize=16, fontweight='bold')
ax.set_xlabel('Time', fontsize=12)
ax.set_ylabel('Temperature (°F)', fontsize=12)

# Combined legend from both axes
lines1, labels1 = ax.get_legend_handles_labels()
if states:
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax.legend(lines1 + lines2, labels1 + labels2, fontsize=11, loc='upper right')
else:
    ax.legend(fontsize=11, loc='upper right')
ax.grid(True, alpha=0.3)

ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M', tz=mtn))
ax.xaxis.set_major_locator(mdates.HourLocator(interval=2, tz=mtn))
fig.autofmt_xdate()

plt.tight_layout()
plt.show()
