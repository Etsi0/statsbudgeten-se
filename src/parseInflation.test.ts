import { beforeAll, describe, expect, test } from "bun:test";
import { InflationSchema, type Inflation } from "../types/InflationSchema";
import { parseInflationWorkbook } from "./parseInflation";

let inflation: Inflation;

beforeAll(async () => {
  const bytes = new Uint8Array(await Bun.file(`${import.meta.dir}/../examples/inflation.xlsx`).arrayBuffer());
  inflation = parseInflationWorkbook(bytes);
});

describe("SCB inflation workbook", () => {
  test("validates against InflationSchema", () => {
    expect(InflationSchema.safeParse(inflation).success).toBe(true);
  });

  test("covers every year from 1831 to the last data year without gaps", () => {
    const years = Object.keys(inflation.rates).map(Number).sort((a, b) => a - b);
    expect(years[0]).toBe(1831);
    expect(years[years.length - 1]).toBeGreaterThanOrEqual(2025);
    expect(years).toEqual(Array.from({ length: years.length }, (_, i) => 1831 + i));
  });

  test("skips the first year, which has a price level but no inflation figure", () => {
    expect(inflation.rates["1830"]).toBeUndefined();
    expect(inflation.rates["1831"]).toBe(4.1);
  });

  test("reads the recent years that the budget data spans", () => {
    expect(inflation.rates["2022"]).toBe(8.4);
    expect(inflation.rates["2023"]).toBe(8.5);
    expect(inflation.rates["2024"]).toBe(2.8);
    expect(inflation.rates["2025"]).toBe(0.7);
  });

  test("names SCB and the data range in the source", () => {
    expect(inflation.source).toMatch(/^SCB, .*1831–20\d\d/);
    expect(inflation.description).toContain("KPI");
  });
});
