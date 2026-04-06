#!/usr/bin/env python3
"""
Furnace replacement payback analysis.

Uses measured UA coefficient (house heat loss) to project annual costs
across different furnace options from Northern Air quote (4/1/2026).
"""

import matplotlib
matplotlib.use('GTK3Agg')
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

# ── Measured house parameters ────────────────────────────────────────

# UA = 506 BTU/hr·°F (measured from duty cycle data, Apr 1-2 2026)
# This is a property of the HOUSE, independent of furnace
UA = 506  # BTU/hr·°F

SETPOINT = 62.0  # °F
GAS_COST_PER_THERM = 1.02  # $/therm (EIA CO avg Jan 2026)
BTU_PER_THERM = 100_000

# Fort Collins 30-year normals
AVG_HIGH = np.array([45, 47, 56, 63, 71, 82, 87, 85, 77, 64, 53, 44], dtype=float)
AVG_LOW  = np.array([18, 21, 29, 35, 44, 53, 59, 57, 48, 36, 26, 18], dtype=float)
DAYS     = np.array([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MONTHS   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

# ── Furnace options (Northern Air quote, 4/1/2026) ───────────────────

furnaces = [
    {
        'name': 'Current Carrier 80%\n(WeatherMaker 8000)',
        'model': '58TUA08014',
        'input_btu': 52_000,   # low fire (what we measured)
        'efficiency': 0.8077,
        'cost': 0,             # already installed
        'color': '#95a5a6',
        'style': '--',
    },
    {
        'name': 'Lennox 80% Single\n(ML180UH090XE48B)',
        'model': 'ML180UH090XE48B',
        'input_btu': 90_000,
        'efficiency': 0.80,
        'cost': 4_530,
        'color': '#e67e22',
        'style': '-',
    },
    {
        'name': 'Lennox 80% Two-Stage\n(EL280UH090XE48B)',
        'model': 'EL280UH090XE48B',
        'input_btu': 90_000,
        'efficiency': 0.80,
        'cost': 5_060,
        'color': '#d35400',
        'style': '-',
    },
    {
        'name': 'Lennox 96% Single\n(EL196UH090XE48C)',
        'model': 'EL196UH090XE48C',
        'input_btu': 90_000,
        'efficiency': 0.96,
        'cost': 6_110,
        'color': '#27ae60',
        'style': '-',
    },
    {
        'name': 'Lennox 97% Two-Stage\n(EL297UH090XE48C)',
        'model': 'EL297UH090XE48C',
        'input_btu': 90_000,
        'efficiency': 0.97,
        'cost': 6_760,
        'color': '#2ecc71',
        'style': '-',
    },
]


# ── Annual heating cost calculation ──────────────────────────────────
# At steady state: heat_delivered = UA × ΔT
# Gas consumed = heat_delivered / efficiency = UA × ΔT / efficiency
# This is independent of furnace size — bigger furnace just cycles less

def annual_gas_cost(efficiency):
    """Annual heating gas cost for a given furnace efficiency."""
    total = 0
    for hi, lo, days in zip(AVG_HIGH, AVG_LOW, DAYS):
        # Diurnal method: average cost at daily high and low
        for t_outside in [hi, lo]:
            delta_t = max(SETPOINT - t_outside, 0)
            heat_demand = UA * delta_t  # BTU/hr needed
            gas_rate = heat_demand / efficiency  # BTU/hr consumed
            cost_per_hour = gas_rate / BTU_PER_THERM * GAS_COST_PER_THERM
            total += cost_per_hour * 24 * days / 2  # /2 for averaging hi and lo
    return total

def annual_therms(efficiency):
    total = 0
    for hi, lo, days in zip(AVG_HIGH, AVG_LOW, DAYS):
        for t_outside in [hi, lo]:
            delta_t = max(SETPOINT - t_outside, 0)
            gas_rate = UA * delta_t / efficiency
            total += gas_rate * 24 * days / 2 / BTU_PER_THERM
    return total


# ── Compute costs for each option ────────────────────────────────────

print("="*70)
print("FURNACE REPLACEMENT PAYBACK ANALYSIS")
print("="*70)
print(f"\nHouse UA: {UA} BTU/hr·°F (measured)")
print(f"Setpoint: {SETPOINT}°F | Gas: ${GAS_COST_PER_THERM}/therm")
print()

results = []
for f in furnaces:
    cost_yr = annual_gas_cost(f['efficiency'])
    therms_yr = annual_therms(f['efficiency'])
    results.append({**f, 'annual_gas': cost_yr, 'annual_therms': therms_yr})

baseline = results[0]['annual_gas']  # current furnace

print(f"{'Option':<35} {'AFUE':>5} {'Install':>8} {'Gas/yr':>8} {'Save/yr':>8} {'Payback':>8}")
print("-" * 80)
for r in results:
    savings = baseline - r['annual_gas']
    if r['cost'] > 0 and savings > 0:
        payback = r['cost'] / savings
        payback_str = f"{payback:.1f} yr"
    elif r['cost'] == 0:
        payback_str = "—"
    else:
        payback_str = "N/A"
    print(f"{r['name'].replace(chr(10), ' '):<35} {r['efficiency']*100:4.0f}% "
          f"${r['cost']:>7,} ${r['annual_gas']:>7,.0f} ${savings:>7,.0f} {payback_str:>8}")

# Comparison: 80% single vs 96% single (the $1,580 question)
base_80 = results[1]['annual_gas']
for r in results[3:]:
    savings_vs_80 = base_80 - r['annual_gas']
    premium = r['cost'] - results[1]['cost']
    payback = premium / savings_vs_80 if savings_vs_80 > 0 else float('inf')
    print(f"\n  {r['name'].replace(chr(10), ' ')} vs 80% single:")
    print(f"    Premium: ${premium:,} | Savings: ${savings_vs_80:,.0f}/yr | Payback: {payback:.1f} yr")


# ── Plotting ─────────────────────────────────────────────────────────

fig, axes = plt.subplots(2, 2, figsize=(16, 12))

# ── Plot 1: Annual gas cost comparison ───────────────────────────────
ax1 = axes[0, 0]
names = [r['name'] for r in results]
costs = [r['annual_gas'] for r in results]
colors = [r['color'] for r in results]

bars = ax1.barh(range(len(results)), costs, color=colors, alpha=0.7, edgecolor='black', linewidth=0.5)
ax1.set_yticks(range(len(results)))
ax1.set_yticklabels(names, fontsize=9)
ax1.set_xlabel('Annual Heating Gas Cost ($)', fontsize=11)
ax1.set_title('Annual Heating Cost by Furnace Option', fontsize=13, fontweight='bold')
ax1.grid(True, alpha=0.3, axis='x')
ax1.invert_yaxis()

for bar, cost in zip(bars, costs):
    ax1.text(bar.get_width() + 5, bar.get_y() + bar.get_height()/2,
             f'${cost:,.0f}/yr', va='center', fontsize=10, fontweight='bold')

# ── Plot 2: Cumulative cost over time (install + gas) ────────────────
ax2 = axes[0, 1]
years = np.arange(0, 21)

for r in results:
    cumulative = r['cost'] + r['annual_gas'] * years
    label = r['name'].replace('\n', ' ')
    ax2.plot(years, cumulative, r['style'], color=r['color'], linewidth=2, label=label)

ax2.set_xlabel('Years', fontsize=11)
ax2.set_ylabel('Cumulative Cost (Install + Gas)', fontsize=11)
ax2.set_title('Total Cost of Ownership Over Time', fontsize=13, fontweight='bold')
ax2.legend(fontsize=8, loc='upper left')
ax2.grid(True, alpha=0.3)
ax2.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, p: f'${x:,.0f}'))

# ── Plot 3: Payback vs gas price sensitivity ─────────────────────────
ax3 = axes[1, 0]
gas_prices = np.linspace(0.60, 2.00, 100)

# 96% single vs 80% single payback
premium_96 = results[3]['cost'] - results[1]['cost']
premium_97 = results[4]['cost'] - results[1]['cost']

for premium, eff_new, label, color in [
    (premium_96, 0.96, '96% single vs 80% single', '#27ae60'),
    (premium_97, 0.97, '97% two-stage vs 80% single', '#2ecc71'),
    (results[2]['cost'] - results[1]['cost'], 0.80, '80% two-stage vs 80% single', '#d35400'),
]:
    savings_at_price = []
    for gp in gas_prices:
        base = 0
        new = 0
        for hi, lo, days in zip(AVG_HIGH, AVG_LOW, DAYS):
            for t_outside in [hi, lo]:
                delta_t = max(SETPOINT - t_outside, 0)
                base += UA * delta_t / 0.80 * 24 * days / 2 / BTU_PER_THERM * gp
                new += UA * delta_t / eff_new * 24 * days / 2 / BTU_PER_THERM * gp
        saving = base - new
        payback = premium / saving if saving > 0 else 50
        savings_at_price.append(min(payback, 30))

    ax3.plot(gas_prices, savings_at_price, color=color, linewidth=2, label=label)

ax3.axvline(GAS_COST_PER_THERM, color='gray', linestyle=':', alpha=0.7, label=f'Current rate (${GAS_COST_PER_THERM}/therm)')
ax3.axhline(10, color='#e74c3c', linestyle='--', alpha=0.3)
ax3.set_xlabel('Gas Price ($/therm)', fontsize=11)
ax3.set_ylabel('Payback Period (years)', fontsize=11)
ax3.set_title('Payback Sensitivity to Gas Price', fontsize=13, fontweight='bold')
ax3.legend(fontsize=8)
ax3.grid(True, alpha=0.3)
ax3.set_ylim(0, 30)

# ── Plot 4: Monthly cost comparison (current vs 96%) ────────────────
ax4 = axes[1, 1]
x = np.arange(12)

monthly_current = []
monthly_96 = []
for hi, lo, days in zip(AVG_HIGH, AVG_LOW, DAYS):
    mc = 0
    m96 = 0
    for t_outside in [hi, lo]:
        delta_t = max(SETPOINT - t_outside, 0)
        mc += UA * delta_t / 0.8077 * 24 * days / 2 / BTU_PER_THERM * GAS_COST_PER_THERM
        m96 += UA * delta_t / 0.96 * 24 * days / 2 / BTU_PER_THERM * GAS_COST_PER_THERM
    monthly_current.append(mc)
    monthly_96.append(m96)

w = 0.35
ax4.bar(x - w/2, monthly_current, w, color='#95a5a6', alpha=0.7, label='Current 80%')
ax4.bar(x + w/2, monthly_96, w, color='#27ae60', alpha=0.7, label='Lennox 96%')

for i in range(12):
    diff = monthly_current[i] - monthly_96[i]
    if diff > 1:
        ax4.text(i, max(monthly_current[i], monthly_96[i]) + 1,
                 f'-${diff:.0f}', ha='center', fontsize=8, color='#27ae60')

ax4.set_xticks(x)
ax4.set_xticklabels(MONTHS)
ax4.set_ylabel('Monthly Gas Cost ($)', fontsize=11)
ax4.set_title('Monthly Savings: Current 80% vs Lennox 96%', fontsize=13, fontweight='bold')
ax4.legend(fontsize=9)
ax4.grid(True, alpha=0.3, axis='y')

fig.suptitle('Furnace Replacement Analysis — Northern Air Quote', fontsize=16, fontweight='bold', y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.96])
fig.savefig('furnace_payback.png', dpi=150, bbox_inches='tight')
print("\nSaved furnace_payback.png")
plt.show()
