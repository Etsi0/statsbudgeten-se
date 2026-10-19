import { describe, expect, test } from "bun:test";
import { InflationSchema } from "../types/InflationSchema";
import { chooseBaseYear, inflationFactor, inflationFactors } from "./inflation";

const rates = { "2023": 10, "2024": 5, "2025": 0, "2026": 2 };

describe("inflationFactor", () => {
  test("same year is 1", () => {
    expect(inflationFactor(rates, 2024, 2024)).toBe(1);
  });

  test("chains the rates after `from` up to and including `to`", () => {
    expect(inflationFactor(rates, 2022, 2024)).toBeCloseTo(1.1 * 1.05, 12);
    expect(inflationFactor(rates, 2022, 2026)).toBeCloseTo(1.1 * 1.05 * 1.0 * 1.02, 12);
    expect(inflationFactor(rates, 2025, 2026)).toBeCloseTo(1.02, 12);
  });

  test("does not need a rate for the `from` year itself", () => {
    // No rate for 2022, yet 2022 → 2023 only needs the 2023 rate.
    expect(inflationFactor(rates, 2022, 2023)).toBeCloseTo(1.1, 12);
  });

  test("going backwards is the inverse", () => {
    const fwd = inflationFactor(rates, 2022, 2026)!;
    expect(inflationFactor(rates, 2026, 2022)).toBeCloseTo(1 / fwd, 12);
  });

  test("a gap in the chain makes the conversion impossible", () => {
    expect(inflationFactor({ "2024": 5, "2026": 2 }, 2022, 2026)).toBeNull();
    expect(inflationFactor({}, 2025, 2026)).toBeNull();
    expect(inflationFactor({ "2026": Number.NaN }, 2025, 2026)).toBeNull();
  });
});

describe("inflationFactors", () => {
  test("marks years without coverage as null and lists the convertible ones", () => {
    const { factors, convertible } = inflationFactors({ "2025": 0, "2026": 2 }, [2022, 2023, 2024, 2025, 2026], 2026);
    expect(factors.get(2026)).toBe(1);
    expect(factors.get(2025)).toBeCloseTo(1.02, 12);
    expect(factors.get(2024)).toBeCloseTo(1.02, 12);
    expect(factors.get(2023)).toBeNull();
    expect(factors.get(2022)).toBeNull();
    expect(convertible).toEqual([2024, 2025, 2026]);
  });
});

describe("InflationSchema", () => {
  test("accepts the shipped template and a filled-in file", async () => {
    const template = await Bun.file(`${import.meta.dir}/../data/inflation.json`).json();
    expect(InflationSchema.safeParse(template).success).toBe(true);
    expect(InflationSchema.safeParse({ rates: { "2024": 2.8 } }).success).toBe(true);
  });

  test("rejects non-year keys and non-numeric rates", () => {
    expect(InflationSchema.safeParse({ rates: { "24": 2.8 } }).success).toBe(false);
    expect(InflationSchema.safeParse({ rates: { "2024": "2,8" } }).success).toBe(false);
  });
});

describe("chooseBaseYear", () => {
  test("is the latest year that has a rate of its own", () => {
    expect(chooseBaseYear({ "2023": 8.5, "2024": 2.8, "2025": 0.7 }, [2022, 2023, 2024, 2025, 2026])).toBe(2025);
    expect(chooseBaseYear({ "2026": 2 }, [2022, 2026])).toBe(2026);
  });

  test("falls back to the latest year when no year has a rate", () => {
    expect(chooseBaseYear({}, [2022, 2026])).toBe(2026);
    expect(chooseBaseYear({}, [])).toBeNull();
  });
});
