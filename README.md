# BTC Cent Forecaster — 4 Hours Ahead

A forecaster for the make.fun bounty
"Forecast Bitcoin's price 4 hours ahead, 12 times over 48 hours"
(`btc-cent-forecast-01`). It reads one case at a time — Bitcoin's
1-minute closes for the 72 hours up to a checkpoint — and writes one
number: its guess of the price 240 minutes later. Score is the mean
absolute error in cents over the cases; lower is better, and a prize
needs a score strictly below the house persistence baseline.

## Strategy

A mild two-signal mean-reversion ensemble, averaged:

- **Trend damping:** `last * exp(-0.10 * log(last / close 240 min ago))`.
  The last 4 hours' move is reversed by 10%: after a sharp fall the
  median next 4 hours sit a little above the checkpoint, after a sharp
  rise a little below it.
- **EMA pull:** `last + 0.10 * (EMA(720) - last)`. The price is pulled
  10% of the way toward its 12-hour exponential average.

`guess = (trend + pull) / 2`, rounded to 5 decimals, clamped to the
scorer's (0, 10,000,000) range.

## Why this shape

Absolute error is a proper scoring rule for one number, so the best
guess is the conditional median of the price 4 hours out. At that
horizon Bitcoin's 1-minute returns are close to a random walk, so the
persistence guess (the checkpoint's own close) is already strong and
any big directional bet is a coin flip that loses in a trending regime.
Only a small pull back toward where the price just came from survives
validation on two independent samples — and the aggressive version of
the same idea (damping the 24-hour move by 20–30%) wins ~10% on the
kit window but loses 20–30% on three weeks of Binance closes, so it
was rejected: that edge is regime-specific, and this entry does not
chase it. Both signals here sit on a flat plateau (dampings and pulls
of 0.08–0.12 all score within half a percent of each other), so
nothing is a tuned spike.

## Local validation (estimates only — the practice window is not the final)

- **Kit practice, 6 cases p00–p05:** MAE **44,688 cents** vs the
  persistence baseline's 44,522 (about even; six cases cannot separate
  a ~2% edge). p05's target was recovered from the baseline's stated
  practice score plus a Binance cross-check, so treat the 6-case
  figure as approximate.
- **Walk-forward inside the kit's own 72-hour windows,** checkpoints
  every 60 minutes over the last 48 hours of each case (264 points):
  MAE **44,111 cents** vs persistence 45,117 (**~2.2% better**).
- **Binance BTC/USDT 1-minute closes, 25 Oct–14 Nov 2026,**
  checkpoints every 4 hours with a 72-hour lookback (106 points,
  trending and choppy weeks alike): MAE **47,350 cents** vs
  persistence 48,252 (**~1.9% better**), better than persistence on
  13 of 18 days and never worse than 1.11x on any single day.

## Running it

Node 22, standard library only, no network, deterministic (a pure
function of the case's prices — no clock, no randomness):

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

It reads every `<id>.in` in the input directory, in name order, and
writes `<id>.out` per case:
`{"forecasts":[{"case":"<id>","price":<number>}]}`. Any unusable input
falls back to a still-valid guess instead of crashing, because a
crashed case is scored invalid and an entry with any invalid case
takes no prize. One case runs in ~0.04 s, far inside the 8 s cap.

## Files

- `main.ts` — the entrypoint (Node 22, standard library only).
- `LICENSE` — MIT.
- `.makefun/owner.json` — the payout wallet this entry belongs to.
