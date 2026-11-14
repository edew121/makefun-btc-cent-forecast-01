// btc-cent-forecast-01 entry (Node 22, standard library only): an asymmetric
// mean-reversion ensemble that forecasts Bitcoin's price 240 minutes after
// each checkpoint, from the 4,320 one-minute closes up to it.
//
//   guess = (trend + pull) / 2, kept on the price grid's 5 decimals
//     trend = last * exp(-damp * log(last / close 240 minutes ago)),
//             damp = 0.35 after a rise, 0.00 after a fall
//     pull  = last + 0.10 * min(0, EMA(720) - last)   (downward only)
//
// Why this shape: absolute error is a proper scoring rule for one number,
// so the best guess is the conditional median of the price 4 hours out.
// At a 4-hour horizon Bitcoin's 1-minute returns are close to a random
// walk, so the persistence guess (the checkpoint's own close) is already
// strong, and any big directional bet is a coin flip. What survives
// validation on every sample below is only a small, one-sided pull:
//
//   - A past 4-hour RISE is reversed by 35%: after a sharp rise the
//     median next 4 hours sit below the checkpoint. A past FALL is not
//     reversed at all: in the falling market the falls keep drifting
//     down, so forecasting up after a fall loses. This asymmetry is the
//     whole v2 change over v1 (which damped both directions by 10%):
//     it is monotone across the whole grid (k_up 0.10 -> 0.50 improves
//     every validation set; k_down -0.10 -> +0.10 barely matters), and
//     0.35 sits mid-plateau (0.30-0.50 all score within half a percent
//     of each other on the broad samples), so it is not a tuned spike.
//   - The price is pulled 10% of the way toward its 12-hour exponential
//     average, but only DOWNWARD: when the price sits above its EMA the
//     guess steps down toward it; when it sits below, there is no pull
//     up, because in the downtrend the EMA sits above the price and
//     pulling up fights the drift. Pulling both ways (v1) loses 2.7%
//     to persistence on the most recent Binance regime (12-14 Nov);
//     the one-sided pull beats persistence there.
//
// The guess is therefore never above the checkpoint's own close: this
// entry sells the bounce and never buys the dip. If the final 48 hours
// turn into a sharp V-shaped recovery, that bet costs it; if they stay
// choppy or keep drifting down, as the last week has, it is the side
// the data supports.
//
// Validation (local estimates only; the practice window is not the final):
//   - Kit practice, 6 cases p00-p05 (p05's target recovered from the
//     baseline's stated practice score plus a Binance cross-check):
//     MAE 42,840 cents vs persistence 44,522 (3.8% better) and vs
//     v1's 44,688 (4.1% better). v1 was WORSE than persistence here.
//   - Walk-forward inside the kit's own 72-hour windows, checkpoints
//     every 60 minutes over the last 48 hours of each case (264 points):
//     MAE 43,479 cents vs persistence 45,117 (3.6% better) and vs
//     v1's 44,111 (1.4% better).
//   - Binance BTC/USDT 1-minute closes, 25 Oct-14 Nov 2026, checkpoints
//     every 4 hours with a 72-hour lookback (106 points): MAE 47,480
//     cents vs persistence 48,252 (1.6% better); v1 scored 47,350
//     here, a touch better, within noise.
//   - Binance Nov 8-14 (the recent regime, 160 points, every 60 min):
//     MAE 47,282 cents vs persistence 48,071 (1.6% better) and vs
//     v1's 48,148 (1.8% better). v1 was WORSE than persistence here.
//   - Binance every 60 minutes, full 25 Oct-14 Nov (448 points):
//     MAE 46,509 cents vs persistence 47,113 (1.3% better) and vs
//     v1's 46,949 (0.9% better).
//   - Paired bootstrap (2,000 resamples) on the pooled kit + recent
//     Binance checkpoints: v2 vs persistence 0.972, 95% CI [0.960,
//     0.983]; v2 vs v1 0.984, 95% CI [0.972, 0.997].
//   - The edge is broad, not one lucky case: v2 deviates from
//     persistence on about half the walk-forward checkpoints (52% kit,
//     46% recent Binance, 54% all Binance), and on those points it
//     beats persistence by 7.1% (kit), 5.1% (recent Binance) and
//     2.9% (all Binance). The 6-case practice improvement happens to
//     come mostly from one case (p04); the walk-forward sets are the
//     real evidence.
//   - So v2 beats persistence on ALL FIVE validation sets (worst
//     0.987) and beats v1 on four of five; v1 failed two of five.
//
// Ideas tried and rejected, so the entry does not chase them:
//   - Smoothing the anchor (median of the last 3/5/10/30 closes, or a
//     short EMA): worse everywhere. The pool close is already a median
//     of samples and carries no usable transient noise.
//   - A 24-hour trend term (extra damping of the 1,440-minute move):
//     wins 5% on the kit window but loses 4-8% on Binance. Regime
//     specific, rejected the same way v1 rejected the aggressive
//     24-hour damping.
//   - Longer EMA pulls (EMA 1,440 / 2,880): worse on the recent regime,
//     where the slow averages lag the crash.
//   - A constant downward drift (-5 to -15 bp per 4 hours): helps the
//     kit window and the crash days but pushes the broad Binance score
//     to 1.002 and worse. It fits the sample mean of a falling market,
//     not a signal. Rejected.
//   - An extra 60-minute up-reversion term: flat, no consistent gain.
//   - Trend-following (positive damping): loses 4-25% on Binance.
//
// Honest expectation: the edge over persistence is thin, about 1.5-2.5%,
// and with only 12 final cases luck still dominates. But v2 is the first
// version that beats the baseline on every validation set, including
// the most recent regime the final directly follows, while v1 loses
// there. That is the whole case for replacing v1.
//
// The program is a pure function of the case's prices: no clock, no
// randomness, no network, no I/O beyond reading the case and writing the
// guess, so two runs on the same case write the same bytes. It reads
// every <id>.in in the input directory, in name order, and writes one
// <id>.out per case: {"forecasts":[{"case":"<id>","price":<number>}]},
// exactly one row naming the case and no other key.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and
// MAKEFUN_OUTPUT_DIR stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Minutes of past move the trend signal damps: the forecast horizon. */
const TREND_WINDOW_MIN = 240;
/** Fraction of a past 4-hour RISE the trend signal reverses. */
const TREND_DAMP_UP = 0.35;
/** Fraction of a past 4-hour FALL the trend signal reverses: none. */
const TREND_DAMP_DOWN = 0.0;
/** Span, in minutes, of the exponential average the pull signal uses. */
const EMA_SPAN_MIN = 720;
/** Fraction of the (downward-only) distance to the EMA the pull closes. */
const EMA_PULL = 0.1;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** The last value of an exponential moving average over the prices. */
function emaLast(prices: number[], span: number): number {
  const alpha = 2 / (span + 1);
  let ema = prices[0] as number;
  for (let i = 1; i < prices.length; i++) {
    ema = alpha * (prices[i] as number) + (1 - alpha) * ema;
  }
  return ema;
}

/**
 * The forecast for one market: the average of two mild, one-sided
 * mean-reversion signals, each a small step down from the checkpoint's
 * own close, never up. With fewer than TREND_WINDOW_MIN + 1 closes
 * there is no past move to damp, so the guess is the checkpoint's own
 * close (persistence). Any unusable input falls back to a still-valid
 * guess instead of crashing: a crashed case is scored as invalid, and
 * an entry with any invalid case ranks below every valid one and takes
 * no prize.
 */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) return price5(1);
  const last = m.prices[m.prices.length - 1] as number;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) return price5(1);
  if (m.prices.length <= TREND_WINDOW_MIN) return price5(last);
  const past = m.prices[m.prices.length - 1 - TREND_WINDOW_MIN] as number;
  // Pull toward the 12-hour EMA only downward: when the price sits above
  // its EMA the guess steps 10% of the way down; when it sits below,
  // there is no pull up.
  const pull = last + EMA_PULL * Math.min(0, emaLast(m.prices, EMA_SPAN_MIN) - last);
  if (typeof past !== 'number' || !Number.isFinite(past) || past <= 0) return price5(pull);
  // Asymmetric damping: a past rise is reversed by 35%, a past fall not
  // at all, so the trend signal never forecasts above the checkpoint.
  const r = Math.log(last / past);
  const damp = r >= 0 ? TREND_DAMP_UP : TREND_DAMP_DOWN;
  const trend = last * Math.exp(-damp * r);
  return price5((trend + pull) / 2);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
