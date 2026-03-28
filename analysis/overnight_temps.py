#!/usr/bin/env python3
"""Plot overnight temperature data from Aeotec sensors."""

import matplotlib
matplotlib.use('GTK3Agg')
import psycopg2
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from zoneinfo import ZoneInfo

conn = psycopg2.connect(dbname="koldenhome", user="koldenhome")
cur = conn.cursor()

cur.execute("""
    SELECT node_id, time, value::text::float
    FROM events
    WHERE node_id IN (58, 59)
      AND property = 'Air temperature'
    ORDER BY time
""")
rows = cur.fetchall()
conn.close()

# Split by node, convert to Mountain time
mtn = ZoneInfo('America/Denver')
top = [(r[1].astimezone(mtn), r[2]) for r in rows if r[0] == 58]
basement = [(r[1].astimezone(mtn), r[2]) for r in rows if r[0] == 59]

fig, ax = plt.subplots(figsize=(12, 6))

ax.plot([t for t, _ in top], [v for _, v in top],
        marker='o', markersize=4, linewidth=2, color='#e74c3c', label="Brent's Office (Top Floor)")
ax.plot([t for t, _ in basement], [v for _, v in basement],
        marker='o', markersize=4, linewidth=2, color='#3498db', label="Rachel's Office (Basement)")

ax.fill_between([t for t, _ in top], [v for _, v in top],
                alpha=0.15, color='#e74c3c')
ax.fill_between([t for t, _ in basement], [v for _, v in basement],
                alpha=0.15, color='#3498db')

ax.set_title('Overnight Temperature — March 26–27, 2026', fontsize=16, fontweight='bold')
ax.set_xlabel('Time', fontsize=12)
ax.set_ylabel('Temperature (°F)', fontsize=12)
ax.legend(fontsize=11, loc='upper right')
ax.grid(True, alpha=0.3)

ax.xaxis.set_major_formatter(mdates.DateFormatter('%-I:%M %p', tz=mtn))
ax.xaxis.set_major_locator(mdates.HourLocator(interval=2, tz=mtn))
fig.autofmt_xdate()

ax.set_ylim(58, 78)

plt.tight_layout()
plt.show()
