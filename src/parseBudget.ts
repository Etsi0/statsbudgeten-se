/**
 * Converts the official Swedish state budget specification workbook
 * ("Specifikation av budgetens utgifter och inkomster", regeringen.se)
 * into the JSON structure defined by types/BudgetJsonSchema.
 *
 * Sheet layout (all amounts in thousands of SEK):
 *
 *  Utgifter — three levels:
 *    utgiftsområde (number in col A, name col B, total col C)
 *      bold rows in col B: anslag group headers ("1 Statschefen") — some
 *        utgiftsområden have none and list anslag directly
 *      regular rows in col B: anslag ("1 Kungliga hov- och slottsstaten")
 *    One ExpenseGroup per utgiftsområde; rows are the anslag with a 1-based
 *    ordinal id in document order (the official anslag number "grupp:nr"
 *    does not fit a plain numeric id).
 *
 *  Inkomster — code-based hierarchy:
 *    inkomsttitel rows (4-digit code in col B, name col C, amount col D) are
 *    the leaves. Group/typ header rows carry their code in col A; the
 *    inkomsttyp row (code divisible by 1000) comes AFTER its content and
 *    carries the typ total. One RevenueGroup per inkomsttyp (id_start/id_end
 *    = its code range); rows are the inkomsttitlar with the official code
 *    as id. Huvudgrupp/undergrupp levels remain derivable from code prefixes.
 */
import { BudgetJsonSchema, type BudgetJson } from "../types/BudgetJsonSchema";
import type { ExpenseGroup, ExpenseRow, RevenueGroup, RevenueRow } from "../types/BudgetRowSchema";
import { readWorkbook, type Cell, type Sheet } from "./xlsx";

/**
 * The published workbook rounds each level to thousands independently, so
 * revenue totals can disagree with the sum of their parts by ±1 tkr (the
 * 2026 file does, at inkomsttyp 1000 and 7000 and at "Summa inkomster").
 * Expenditure totals add up exactly and are checked exactly.
 */
const REVENUE_ROUNDING_TOLERANCE = 2;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const num = (cell: Cell | undefined, context: string): number => {
  if (typeof cell?.value !== "number") throw new Error(`Expected a number for ${context}, got ${JSON.stringify(cell?.value)}`);
  return cell.value;
};

function extractYear(sheet: Sheet, sheetName: string): number {
  for (const row of sheet) {
    const value = row?.[0]?.value;
    if (typeof value === "string") {
      const year = value.match(/^Specifikation av budgetens \w+ för (\d{4})$/)?.[1];
      if (year) return +year;
    }
  }
  throw new Error(`Could not find the "Specifikation av budgetens ... för <år>" title in sheet ${sheetName}`);
}

function parseExpenses(sheet: Sheet): { groups: ExpenseGroup[]; total: number } {
  const groups: ExpenseGroup[] = [];
  let total: number | undefined;
  let current: ExpenseGroup | undefined;
  // Bold rows are anslag-group subtotals; tracked only to verify that the
  // bold/regular classification matched the document's arithmetic.
  let boldGroup: { title: string; total: number; sum: number } | undefined;

  const closeBoldGroup = () => {
    if (boldGroup && boldGroup.total !== boldGroup.sum) {
      throw new Error(`Utgifter: group "${boldGroup.title}" totals ${boldGroup.total} but its anslag sum to ${boldGroup.sum}`);
    }
    boldGroup = undefined;
  };

  for (const row of sheet) {
    if (!row) continue;
    const [a, b, c] = row;
    if (typeof b?.value !== "string") continue;
    const name = clean(b.value);
    if (!name) continue;

    if (name === "Summa anslag") {
      total = num(c, '"Summa anslag"');
      continue;
    }

    const areaNumber = a?.value;
    if (areaNumber !== undefined && areaNumber !== "" && Number.isFinite(+areaNumber)) {
      closeBoldGroup();
      current = { uo: +areaNumber, title: name, total: num(c, `utgiftsområde ${+areaNumber}`), rows: [] };
      groups.push(current);
      continue;
    }

    if (!current || typeof c?.value !== "number") continue;
    if (b.bold) {
      closeBoldGroup();
      boldGroup = { title: name, total: c.value, sum: 0 };
    } else {
      const expenseRow: ExpenseRow = {
        id: current.rows.length + 1,
        title: name.replace(/^\d+ /, ""),
        expense: c.value,
      };
      current.rows.push(expenseRow);
      if (boldGroup) boldGroup.sum += c.value;
    }
  }
  closeBoldGroup();

  if (total === undefined) throw new Error('Utgifter: no "Summa anslag" row found');
  if (groups.length === 0) throw new Error("Utgifter: no utgiftsområden found");
  for (const group of groups) {
    const sum = group.rows.reduce((s, r) => s + r.expense, 0);
    if (sum !== group.total) {
      throw new Error(`Utgifter: utgiftsområde ${group.uo} totals ${group.total} but its anslag sum to ${sum}`);
    }
  }
  const sum = groups.reduce((s, g) => s + g.total, 0);
  if (sum !== total) throw new Error(`Utgifter: "Summa anslag" is ${total} but the utgiftsområden sum to ${sum}`);
  return { groups, total };
}

function parseRevenues(sheet: Sheet): { groups: RevenueGroup[]; total: number } {
  const groups: RevenueGroup[] = [];
  let pending: RevenueRow[] = [];
  let total: number | undefined;

  for (const row of sheet) {
    if (!row) continue;
    const [a, b, c, d] = row;

    if (typeof a?.value === "string" && clean(a.value) === "Summa inkomster") {
      total = num(d, '"Summa inkomster"');
      continue;
    }

    // Header rows carry their code in col A. Inkomsttyp rows (code divisible
    // by 1000) follow their content and close the group; huvudgrupp- and
    // undergrupp headers (and the textual range headers, which keep col A as
    // a string) are presentational and skipped.
    if (typeof a?.value === "number" && typeof b?.value === "string") {
      const code = a.value;
      if (code % 1000 === 0) {
        groups.push({
          title: clean(b.value),
          id_start: code,
          id_end: code + 999,
          total: num(d, `inkomsttyp ${code}`),
          rows: pending,
        });
        pending = [];
      }
      continue;
    }

    // Inkomsttitel: 4-digit code in col B, name in col C, amount in col D.
    if (typeof b?.value === "number" && typeof c?.value === "string" && typeof d?.value === "number") {
      pending.push({ id: b.value, title: clean(c.value), revenue: d.value });
    }
  }

  if (total === undefined) throw new Error('Inkomster: no "Summa inkomster" row found');
  if (groups.length === 0) throw new Error("Inkomster: no inkomsttyper found");
  if (pending.length > 0) {
    throw new Error(`Inkomster: ${pending.length} inkomsttitlar after the last inkomsttyp row (first: ${pending[0]!.id})`);
  }
  for (const group of groups) {
    const sum = group.rows.reduce((s, r) => s + r.revenue, 0);
    if (Math.abs(sum - group.total) > REVENUE_ROUNDING_TOLERANCE) {
      throw new Error(`Inkomster: inkomsttyp ${group.id_start} totals ${group.total} but its titlar sum to ${sum}`);
    }
  }
  const sum = groups.reduce((s, g) => s + g.total, 0);
  if (Math.abs(sum - total) > REVENUE_ROUNDING_TOLERANCE) {
    throw new Error(`Inkomster: "Summa inkomster" is ${total} but the inkomsttyper sum to ${sum}`);
  }
  return { groups, total };
}

/** Parses a budget specification workbook and validates the result. */
export function parseBudgetWorkbook(bytes: Uint8Array): { year: number; budget: BudgetJson } {
  const sheets = readWorkbook(bytes);
  const utgifter = sheets.get("Utgifter");
  const inkomster = sheets.get("Inkomster");
  if (!utgifter || !inkomster) {
    throw new Error(`Expected sheets "Utgifter" and "Inkomster", found: ${[...sheets.keys()].join(", ")}`);
  }

  const year = extractYear(utgifter, "Utgifter");
  const revenueYear = extractYear(inkomster, "Inkomster");
  if (year !== revenueYear) throw new Error(`Sheet years disagree: Utgifter says ${year}, Inkomster says ${revenueYear}`);

  const expenses = parseExpenses(utgifter);
  const revenues = parseRevenues(inkomster);

  const budget = BudgetJsonSchema.parse({
    expenses: expenses.groups,
    revenues: revenues.groups,
    expensesTotal: expenses.total,
    revenuesTotal: revenues.total,
  });
  return { year, budget };
}
