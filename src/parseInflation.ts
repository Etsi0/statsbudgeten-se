/**
 * Converts SCB's "Inflation i Sverige 1831–" workbook (the xlsx export of
 * the historical CPI series) into data/inflation.json, see
 * types/InflationSchema.ts.
 *
 * Sheet layout: a "Data" sheet whose header row reads År | Inflation |
 * Prisnivå (there is an English copy of the header above it). Every row
 * after it has the year in col A, the annual change in percent in col B and
 * the price index (July 1914 = 100) in col C. The first year has a price
 * level but no inflation figure, since there is no earlier year to compare
 * with. From 1951 on the years are stored as text, not numbers. A
 * "Data t.o.m <år>" cell says how far the series goes.
 */
import { InflationSchema, type Inflation } from "../types/InflationSchema";
import { readWorkbook, type Cell, type Sheet } from "./xlsx";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const str = (cell: Cell | undefined) => (typeof cell?.value === "string" ? clean(cell.value) : undefined);

/** A numeric cell, or a cell holding a number as text (the SCB sheet stores the years from 1951 on as text). */
const num = (cell: Cell | undefined): number | undefined => {
  const v = cell?.value;
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^-?\d+([.,]\d+)?$/.test(v.trim())) return Number(v.trim().replace(",", "."));
  return undefined;
};

/** Picks the sheet with a "År | Inflation" header, preferring one named "Data". */
function findDataSheet(sheets: Map<string, Sheet>): { sheet: Sheet; headerRow: number } {
  const candidates = [...sheets.entries()].sort(([a], [b]) => (a === "Data" ? -1 : b === "Data" ? 1 : 0));
  for (const [, sheet] of candidates) {
    for (const [i, row] of sheet.entries()) {
      if (str(row?.[0])?.toLowerCase() === "år" && str(row?.[1])?.toLowerCase() === "inflation") {
        return { sheet, headerRow: i };
      }
    }
  }
  throw new Error(`No sheet with an "År | Inflation" header row; sheets: ${[...sheets.keys()].join(", ")}`);
}

function findDataUntil(sheet: Sheet): number | undefined {
  for (const row of sheet) {
    for (const cell of row ?? []) {
      const m = str(cell)?.match(/^Data t\.?o\.?m\.?\s+(\d{4})$/i);
      if (m) return +m[1]!;
    }
  }
  return undefined;
}

/** Parses the SCB inflation workbook into the shape of data/inflation.json. */
export function parseInflationWorkbook(bytes: Uint8Array): Inflation {
  const sheets = readWorkbook(bytes);
  const { sheet, headerRow } = findDataSheet(sheets);

  const rates: Record<string, number> = {};
  let firstYear: number | undefined;
  let previousYear: number | undefined;
  for (const row of sheet.slice(headerRow + 1)) {
    const year = num(row?.[0]);
    if (year === undefined) {
      if (previousYear !== undefined) break; // the series has ended
      continue;
    }
    if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error(`Inflation: unexpected year ${year}`);
    if (previousYear !== undefined && year !== previousYear + 1) {
      throw new Error(`Inflation: years are not consecutive (${previousYear} is followed by ${year})`);
    }
    previousYear = year;
    firstYear ??= year;

    const raw = row?.[1]?.value;
    if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
      // Only the first year of the series may lack an inflation figure.
      if (year !== firstYear) throw new Error(`Inflation: no inflation figure for ${year}`);
      continue;
    }
    const rate = num(row?.[1]);
    if (rate === undefined || !Number.isFinite(rate)) throw new Error(`Inflation: expected a number for ${year}, got ${JSON.stringify(raw)}`);
    rates[String(year)] = rate;
  }
  if (previousYear === undefined || Object.keys(rates).length === 0) throw new Error("Inflation: no data rows found");

  const until = findDataUntil(sheet);
  if (until !== undefined && until !== previousYear) {
    throw new Error(`Inflation: the sheet says data up to ${until} but the last row is ${previousYear}`);
  }

  const rateYears = Object.keys(rates).map(Number);
  const firstRateYear = Math.min(...rateYears);
  return InflationSchema.parse({
    description:
      "Årlig inflation i procent (KPI, förändring i årsmedeltal mot föregående år). Nyckeln är året, värdet är inflationen det året. För att räkna om år A till år B:s prisnivå behövs värden för A+1 … B, så basåret självt behöver inget värde.",
    source: `SCB, Inflation och prisnivå i Sverige ${firstRateYear}–${previousYear} (KPI), data t.o.m. ${previousYear}`,
    rates,
  });
}
