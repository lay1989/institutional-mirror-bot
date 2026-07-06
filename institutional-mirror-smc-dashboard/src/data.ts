/**
 * Static educational and system rules data for the Institutional Mirror reference tab.
 */

export interface ReferenceSection {
  id: string;
  title: string;
  content: string;
  category: string;
}

export const REFERENCE_SECTIONS: ReferenceSection[] = [
  {
    id: 'casino-math',
    title: '1. The Casino Math (EV & Probabilities)',
    category: 'Risk & Mathematics',
    content: `Trading is not about guessing where price goes; it is about acting as the casino (the house) by executing a positive Expected Value (EV) model over a large sample size.

### The EV Formula:
**EV = (Win Rate × Average Win) − (Loss Rate × Average Loss)**

For our 6-Point SMC model, we target three structured Take Profit (TP) tranches:
- **TP1 (1:1 Risk-Reward Ratio):** Close 30% of position, move Stop Loss (SL) to Break Even (BE).
- **TP2 (1:1.5 Risk-Reward Ratio):** Close 30% of position, move SL to TP1.
- **TP3 (1:3.5 Risk-Reward Ratio):** Close 40% of position.

### Mathematical Example:
Let's assume a conservative 45% Win Rate to TP3, 15% stopped at BE (TP1 hit then stopped), and 40% full losses:
- **Average Win R-Multiple:** (30% × 1.0R) + (30% × 1.5R) + (40% × 3.5R) = 0.3R + 0.45R + 1.4R = **2.15R**
- **Average Loss R-Multiple:** (40% × -1.0R) + (15% × 0R) = **-0.4R**
- **Expected Value per Trade:** (0.45 × 2.15R) + (0.15 × 0R) − (0.40 × 1.0R) = 0.9675R − 0.40R = **+0.5675R per trade**

Over 100 trades risking 1% ($100 on a $10,000 account), this model yields a mathematical expected return of **+$5,675**, even with more losing than winning days. Never bypass the plan; let the law of large numbers work.`
  },
  {
    id: 'kill-zones',
    title: '2. Kill Zone Times UTC',
    category: 'Market Timing',
    content: `Algorithmic order flow delivers liquidity in precise time windows. Institutional algorithms are programmed around specific central banks and session opens. Trading outside these hours means entering low-volatility "dead zones" where retail traders are chopped up.

| Session / Window | UTC Time | EST/EDT Time | Strategy & Intraday Purpose |
| :--- | :--- | :--- | :--- |
| **Asian Range** | 00:00 – 04:00 | 19:00 – 23:00 (EST) | Accumulation. Sets the initial daily high and low boundaries. Do not trade; observe boundaries. |
| **London Kill Zone** | 07:00 – 10:00 | 02:00 – 05:00 (EST) | Manipulation phase. Frequently sweeps the Asian high or low to form the low/high of the day. |
| **New York Kill Zone** | 12:00 – 15:00 | 07:00 – 10:00 (EST) | Distribution phase. High-impact news releases act as catalysts. Executes trend continuations or reversals. |
| **Silver Bullet** | 15:00 – 16:00 | 10:00 – 11:00 (EST) | Late-day algorithm delivery window. Highly reliable sweep of previous session highs/lows. |

*Golden Rule: Always wait 20 minutes after the Kill Zone open before executing. Let the initial manipulation sweep clear out early breakout traders first.*`
  },
  {
    id: 'amd-bias',
    title: '3. Accumulation, Manipulation, Distribution (AMD) Daily Bias Model',
    category: 'Market Cycle',
    content: `The market moves in a three-phase cycle every single day:

1. **Accumulation (Asian Session):** Price moves sideways, building up huge pools of liquidity (Stop Losses and buy/sell stops) above and below the range boundaries.
2. **Manipulation (London Session):** Smart money drives price rapidly in one direction, sweeping the accumulated Asian session liquidity.
   - If **London sweeps the Asian High**, price is engineered to trap breakout buyers. Once swept and snapped back, the directional bias for New York is **BEARISH**.
   - If **London sweeps the Asian Low**, price traps breakout sellers. Once swept and snapped back, the directional bias for New York is **BULLISH**.
3. **Distribution (New York Session):** Price expands aggressively in the true intended direction, targeting the opposite pool of liquidity.

*Tip: Align your entry with the NY bias. If London swept Asian Lows, NY is looking to buy the discount FVG (Fair Value Gap) and target the Asian Highs.*`
  },
  {
    id: 'premium-discount',
    title: '4. Premium vs Discount Zones (Fibonacci 50%)',
    category: 'Trade Location',
    content: `Never buy high, never sell low. Institutional traders buy at a "Discount" and sell at a "Premium". 

### How to map zones:
1. Identify the recent **High-Timeframe (HTF) Swing Range** (the swing high and swing low on the 1H or 4H chart that initiated the displacement).
2. Plot a Fibonacci Retracement from the absolute Swing Low to Swing High.
3. The **50% equilibrium level** splits the range:
   - **Above 50% = Premium Zone.** Only look for SHORT setups here. Buying here has a terrible risk-to-reward ratio.
   - **Below 50% = Discount Zone.** Only look for LONG setups here. Selling here traps you at low prices.
   - **At 50% = Equilibrium.** No trades allowed. Market is in balance.

*Rule of thumb: A setup can score 5/6, but if a Long trade is in the Premium zone, it must be discarded immediately.*`
  },
  {
    id: 'entry-sequence',
    title: '5. 6-Point Entry Sequence (Confluence Guide)',
    category: 'Execution',
    content: `Wait for the setups to come to you. A high-probability institutional entry requires step-by-step confirmation:

1. **HTF Bias Alignment:** Zoom out. Ensure your trade matches the daily/weekly bias and that the 4H EMA 20/50 are clearly spread and trending (not flat or tangled).
2. **Kill Zone Activation:** Execute strictly inside the defined UTC Kill Zones. Check the live countdown on your dashboard.
3. **Price Zone Check:** Verify price is in Discount for Longs or Premium for Shorts.
4. **Liquidity Sweep:** Watch for price to pierce an old high/low (Asian High/Low, Previous Daily High/Low, Equal Highs/Lows) and immediately reject.
5. **MSS + Displacement (5M/15M):** Look for a Market Structure Shift (MSS) — price breaks the last counter-trend structural pivot. Look for a massive displacement candle that leaves behind a Fair Value Gap (FVG), where the wicks of candle 1 and candle 3 do not overlap.
6. **Clean Runway:** Ensure there are no major institutional obstacles (Order Blocks, unfilled FVGs, or psychological round numbers) between your entry and TP3.`
  },
  {
    id: 'risk-rules',
    title: '6. Complete Risk Rules & Portfolio Defense',
    category: 'Risk & Mathematics',
    content: `Capital preservation is your primary objective. As a professional, you are a risk manager first and a trader second.

- **Risk per Setup:** Strictly **1.0% maximum** of account balance per trade. (Type B counter-trend setups should use **0.5%** risk).
- **Maximum Leverage:** 5x maximum. Anything higher exposes your account to liquidation risk during intraday volatility. Use **Isolated Margin** at all times.
- **Maximum Daily Loss Limit:** If total closed losses in a single UTC day reach **3.0%** of your total starting daily account balance, terminate all trading. Close the laptop.
- **Mandatory Cooling Break:** If you suffer **3 consecutive losses**, you are forbidden from opening any new trades for **24 hours**. This resets your psychology and prevents revenge trading.
- **Profit Cap Rule:** If your daily profit reaches **3% or more**, stop trading for the day. Lock in your gains and step away.`
  },
  {
    id: 'funding-rates',
    title: '7. Funding Rate Rules for Crypto Traders',
    category: 'Market Timing',
    content: `Funding rates represent periodic payments made between long and short traders on perpetual swap exchanges. They reflect market sentiment extremes.

- **Acceptable Trading Range:** **-0.1% to +0.1%** per 8-hour cycle.
- **Extremely High Positive Funding (> +0.1%):** Means long traders are paying shorts heavily to maintain their positions. Retail is excessively bullish. This is a prime condition for a "long squeeze" liquidation cascade. Be extremely cautious with longs.
- **Extremely Negative Funding (< -0.1%):** Retail is panic-shorting. This is a prime condition for a "short squeeze" where the market spikes upward to clear out shorts. Be extremely cautious with shorts.

*Rule: Check funding rate before entry. If it is outside the neutral threshold, do not take trend-following trades in that direction.*`
  },
  {
    id: 'htf-levels',
    title: '8. Previous Week/Month High and Low Levels',
    category: 'Trade Location',
    content: `High-timeframe structural levels hold massive pools of buy/sell stops. Institutions use these pools of liquidity to fill their large orders.

- **PDH / PDL:** Previous Daily High and Previous Daily Low.
- **PWH / PWL:** Previous Week High and Previous Week Low.
- **PMH / PML:** Previous Month High and Previous Month Low.

These levels represent the ultimate "liquidity pools". Price will frequently make a false breakout (sweep) past these levels, trap breakout traders, and reverse aggressively. 
*Mondays special rule:* Previous Week High/Low (PWH/PWL) mapping must be done first thing in the morning. Highlight your dashboard Monday checklist to verify this task is done.`
  },
  {
    id: 'backtesting',
    title: '9. Backtesting Protocol (Weekly Reps)',
    category: 'Execution',
    content: `Confidence is built in the simulator, not in live markets. You must run weekly backtests to maintain "chart eye" accuracy.

### The 3-Step Backtest Protocol:
1. **The Saturday Rewind:** Load your charting platform, go back 1 month, and play the charts bar-by-bar through the previous weeks.
2. **SMC Logbook:** Track every setup that occurred during the UTC Kill Zones. Grade each setup (1 to 6 confluences).
3. **Data Logging:** Log these backtested setups into a spreadsheet. Confirm if the Win Rate and Profit Factor align with your historical averages.

*Goal: Complete 50 historical setup reviews per week. If your live performance degrades, stop trading and return to backtesting until you achieve 3 consecutive winning backtested weeks.*`
  },
  {
    id: 'review-schedule',
    title: '10. Journal Review Schedule',
    category: 'Execution',
    content: `Logging your trades is useless if you never review the data. The Institutional Mirror requires a strict review cadence:

- **Weekly Review (Every Sunday):**
  - Open the **History & Stats** tab of your journal.
  - Check your Win Rate by Kill Zone. Are you losing money in the Asian session? (If so, stop trading it).
  - Review your Type A vs Type B win rate. Is your Type B (counter-trend) trade drag dragging down your equity curve?
- **Monthly Review (1st Day of Each Month):**
  - Export your trades as CSV.
  - Review your "What went wrong" notes. Look for recurring behavioral patterns (e.g., entering early, FOMO, skipping the 20-minute zone rule).
  - Adjust your strategy focus to eliminate your top 2 behavioral mistakes for the upcoming month.`
  },
  {
    id: 'pairs-macro',
    title: '11. Pairs & Macro Conditions',
    category: 'Market Cycle',
    content: `Not all crypto assets are created equal. Keep your focus tight to ensure high liquidity and reliable SMC execution:

- **Primary Assets:** **BTC/USDT** and **ETH/USDT**. These have the highest liquidity depth, minimal slippage, and perfectly follow algorithmic order flow.
- **Secondary Assets:** High-cap majors like **SOL/USDT**. These exhibit higher volatility, which can offer larger moves, but require tighter risk control.
- **Macro Alignment (DXY & SPX):**
  - **The US Dollar Index (DXY):** Crypto is inversely correlated to the DXY. If DXY is sweeping highs and rejecting (bearish structure shift), it acts as a strong bullish catalyst for BTC and ETH.
  - **S&P 500 (SPX):** Risk-on equity sentiment strongly correlates with crypto. High-timeframe bullish market structure on SPX increases the success rate of crypto discount longs.`
  }
];
