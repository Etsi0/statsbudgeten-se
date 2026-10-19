/**
 * Price-level conversion from annual inflation rates.
 *
 * `rates[Y]` is the percentage change in the price level from year Y−1 to
 * year Y. The factor that expresses year `from` in year `to`'s prices is the
 * chained product of (1 + rate/100) over the years after `from` up to and
 * including `to` (or its inverse when going backwards). A missing rate
 * anywhere in that chain makes the conversion impossible, and the factor is
 * `null` so callers can fall back to nominal values and say so.
 */

export type InflationRates = Record<string, number>;

/** Multiplier that converts an amount in `from`-year prices to `to`-year prices, or null if the rates don't cover the span. */
export function inflationFactor(rates: InflationRates, from: number, to: number): number | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from === to) return 1;
  const [lo, hi] = from < to ? [from, to] : [to, from];
  let factor = 1;
  for (let y = lo + 1; y <= hi; y++) {
    const rate = rates[String(y)];
    if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
    factor *= 1 + rate / 100;
  }
  return from < to ? factor : 1 / factor;
}

/**
 * Factors for every year in `years` into `base`-year prices. Years that cannot
 * be converted map to null. `convertible` lists the years with a factor.
 */
export function inflationFactors(rates: InflationRates, years: number[], base: number) {
  const factors = new Map<number, number | null>();
  for (const y of years) factors.set(y, inflationFactor(rates, y, base));
  const convertible = years.filter((y) => factors.get(y) != null);
  return { factors, convertible };
}
