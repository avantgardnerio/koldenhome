#!/usr/bin/env python3
"""
Annual heating cost forecast for KoldenHome.

Uses the measured heating demand model (duty = 1.20%/°F × ΔT) with Fort Collins
30-year temperature normals to project monthly and annual heating costs.
"""

import matplotlib
matplotlib.use('GTK3Agg')
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from calendar import monthrange

# ── Measured model parameters ────────────────────────────────────────

M_HEAT = 0.0120            # duty cycle per °F of ΔT (from Apr 1-2 fit)
SETPOINT = 62.0             # °F heating setpoint
FURNACE_INPUT = 52_000      # BTU/hr gas consumed (low fire)
GAS_COST_PER_THERM = 1.02   # $/therm (EIA CO residential, Jan 2026)
BTU_PER_THERM = 100_000

# ── Fort Collins 30-year normals (1991–2020) ─────────────────────────
# Source: currentresults.com / NOAA COOP station
# Mean = (avg_high + avg_low) / 2

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

AVG_HIGH = np.array([45, 47, 56, 63, 71, 82, 87, 85, 77, 64, 53, 44], dtype=float)
AVG_LOW  = np.array([18, 21, 29, 35, 44, 53, 59, 57, 48, 36, 26, 18], dtype=float)
AVG_MEAN = (AVG_HIGH + AVG_LOW) / 2
DAYS_IN_MONTH = np.array([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])


# ── Compute monthly costs ────────────────────────────────────────────

def heating_cost_per_day(t_outside):
    """Daily heating gas cost at a given outside temperature."""
    delta_t = max(SETPOINT - t_outside, 0)
    duty = min(M_HEAT * delta_t, 1.0)
    return duty * FURNACE_INPUT * 24 / BTU_PER_THERM * GAS_COST_PER_THERM

def heating_duty(t_outside):
    delta_t = max(SETPOINT - t_outside, 0)
    return min(M_HEAT * delta_t, 1.0)

# Method 1: Simple — use monthly mean temp
monthly_cost_mean = np.array([heating_cost_per_day(t) * d for t, d in zip(AVG_MEAN, DAYS_IN_MONTH)])
monthly_duty_mean = np.array([heating_duty(t) for t in AVG_MEAN])

# Method 2: Diurnal swing — average the cost at high and low temps
# This is more accurate because cost(mean(T)) ≤ mean(cost(T)) due to the
# max(0) clamp: warm afternoons produce zero, cold nights produce a lot
monthly_cost_diurnal = np.array([
    (heating_cost_per_day(hi) + heating_cost_per_day(lo)) / 2 * d
    for hi, lo, d in zip(AVG_HIGH, AVG_LOW, DAYS_IN_MONTH)
])
monthly_duty_diurnal = np.array([
    (heating_duty(hi) + heating_duty(lo)) / 2
    for hi, lo in zip(AVG_HIGH, AVG_LOW)
])

annual_cost_mean = monthly_cost_mean.sum()
annual_cost_diurnal = monthly_cost_diurnal.sum()


# ── Plotting ─────────────────────────────────────────────────────────

fig, axes = plt.subplots(2, 2, figsize=(16, 12))

# ── Plot 1: Monthly cost bar chart ───────────────────────────────────
ax1 = axes[0, 0]
x = np.arange(12)
w = 0.35
bars1 = ax1.bar(x - w/2, monthly_cost_mean, w, color='#f39c12', alpha=0.7, label='Mean temp method')
bars2 = ax1.bar(x + w/2, monthly_cost_diurnal, w, color='#e74c3c', alpha=0.7, label='Diurnal swing method')

ax1.set_xticks(x)
ax1.set_xticklabels(MONTHS)
ax1.set_ylabel('Estimated Gas Cost ($)', fontsize=11)
ax1.set_title('Monthly Heating Cost Forecast', fontsize=13, fontweight='bold')
ax1.legend(fontsize=9)
ax1.grid(True, alpha=0.3, axis='y')

# Add cost labels on diurnal bars
for bar, cost in zip(bars2, monthly_cost_diurnal):
    if cost > 1:
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                 f'${cost:.0f}', ha='center', va='bottom', fontsize=8)

ax1.text(0.97, 0.97,
         f'Annual total:\n'
         f'  Mean method: ${annual_cost_mean:,.0f}\n'
         f'  Diurnal method: ${annual_cost_diurnal:,.0f}\n\n'
         f'Setpoint: {SETPOINT}°F\n'
         f'Low fire: {FURNACE_INPUT:,} BTU/hr\n'
         f'Gas: ${GAS_COST_PER_THERM}/therm',
         transform=ax1.transAxes, fontsize=9, verticalalignment='top',
         horizontalalignment='right', family='monospace',
         bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8))

# ── Plot 2: Temperature normals + setpoint ───────────────────────────
ax2 = axes[0, 1]
ax2.fill_between(x, AVG_LOW, AVG_HIGH, alpha=0.2, color='#3498db', label='Daily range')
ax2.plot(x, AVG_MEAN, 'o-', color='#3498db', linewidth=2, label='Mean temp')
ax2.plot(x, AVG_HIGH, '^--', color='#e74c3c', alpha=0.5, markersize=5, label='Avg high')
ax2.plot(x, AVG_LOW, 'v--', color='#2980b9', alpha=0.5, markersize=5, label='Avg low')
ax2.axhline(SETPOINT, color='#e74c3c', linestyle=':', linewidth=2, label=f'Setpoint ({SETPOINT}°F)')

ax2.set_xticks(x)
ax2.set_xticklabels(MONTHS)
ax2.set_ylabel('Temperature (°F)', fontsize=11)
ax2.set_title('Fort Collins Temperature Normals (1991–2020)', fontsize=13, fontweight='bold')
ax2.legend(fontsize=9, loc='upper left')
ax2.grid(True, alpha=0.3)

# Shade months where heating is needed (mean below setpoint)
for i in range(12):
    if AVG_MEAN[i] < SETPOINT:
        ax2.axvspan(i - 0.5, i + 0.5, alpha=0.05, color='#e74c3c')

# ── Plot 3: Duty cycle by month ──────────────────────────────────────
ax3 = axes[1, 0]
ax3.bar(x, monthly_duty_diurnal * 100, color='#e74c3c', alpha=0.6)
ax3.set_xticks(x)
ax3.set_xticklabels(MONTHS)
ax3.set_ylabel('Average Duty Cycle (%)', fontsize=11)
ax3.set_title('Projected Monthly Heating Duty Cycle', fontsize=13, fontweight='bold')
ax3.grid(True, alpha=0.3, axis='y')

for i, d in enumerate(monthly_duty_diurnal):
    if d > 0.01:
        ax3.text(i, d * 100 + 0.5, f'{d*100:.0f}%', ha='center', va='bottom', fontsize=9)

# ── Plot 4: Cumulative cost through the year ─────────────────────────
ax4 = axes[1, 1]
cumulative = np.cumsum(monthly_cost_diurnal)
ax4.fill_between(x, 0, cumulative, alpha=0.15, color='#f39c12')
ax4.plot(x, cumulative, 'o-', color='#f39c12', linewidth=2, markersize=6)

ax4.set_xticks(x)
ax4.set_xticklabels(MONTHS)
ax4.set_ylabel('Cumulative Gas Cost ($)', fontsize=11)
ax4.set_title('Cumulative Annual Heating Cost', fontsize=13, fontweight='bold')
ax4.grid(True, alpha=0.3)
ax4.yaxis.set_major_formatter(mticker.FormatStrFormatter('$%.0f'))

for i in [2, 5, 11]:  # Mar, Jun, Dec milestones
    ax4.annotate(f'${cumulative[i]:,.0f}', (i, cumulative[i]),
                 textcoords="offset points", xytext=(10, -10), fontsize=10,
                 bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.8))

fig.suptitle('Annual Heating Cost Forecast — Fort Collins, CO', fontsize=16, fontweight='bold', y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.96])
fig.savefig('yearly_forecast.png', dpi=150, bbox_inches='tight')
print("Saved yearly_forecast.png")
plt.show()

# ── Print summary ────────────────────────────────────────────────────
print("\n" + "="*65)
print("ANNUAL HEATING COST FORECAST — Fort Collins, CO")
print("="*65)
print(f"\nModel: duty = {M_HEAT*100:.2f}%/°F × ΔT (measured Apr 1–2, 2026)")
print(f"Setpoint: {SETPOINT}°F | Low fire: {FURNACE_INPUT:,} BTU/hr | Gas: ${GAS_COST_PER_THERM}/therm")
print(f"\n{'Month':>5}  {'Mean°F':>6}  {'Low°F':>5}  {'High°F':>6}  {'Duty%':>5}  {'$/day':>6}  {'$/month':>8}")
print("-" * 55)
for i in range(12):
    cost_day = monthly_cost_diurnal[i] / DAYS_IN_MONTH[i]
    duty = monthly_duty_diurnal[i]
    print(f"{MONTHS[i]:>5}  {AVG_MEAN[i]:6.1f}  {AVG_LOW[i]:5.0f}  {AVG_HIGH[i]:6.0f}  "
          f"{duty*100:5.1f}  {cost_day:6.2f}  {monthly_cost_diurnal[i]:8.2f}")
print("-" * 55)
print(f"{'TOTAL':>5}  {'':>6}  {'':>5}  {'':>6}  {'':>5}  {'':>6}  ${annual_cost_diurnal:7.2f}")
print(f"\nNote: Diurnal method accounts for daily high/low swing around setpoint.")
print(f"      Summer months (Jun-Aug) have near-zero heating cost.")
print()
