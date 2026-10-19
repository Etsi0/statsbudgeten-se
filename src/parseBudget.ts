/**
 * Converts the official Swedish state budget specification workbook
 * ("Specifikation av budgetens utgifter och inkomster", regeringen.se)
 * into the JSON structure defined by types/BudgetJsonSchema.
 *
 * The published workbooks are not laid out identically from year to year,
 * so the parser detects the layout per sheet rather than assuming fixed
 * columns. Known variants (2022–2026), all amounts in thousands of SEK:
 *
 *  Utgifter — three levels:
 *    utgiftsområde (number, name, total in three consecutive columns)
 *      bold rows: anslag group headers ("1 Statschefen") — some
 *        utgiftsområden have none and list anslag directly
 *      regular rows: anslag ("1 Kungliga hov- och slottsstaten")
 *    The three columns start at col A (2026) or col B (2022–2025); the
 *    offset is taken from the sheet title cell. The 2023 file lacks the
 *    header row for utgiftsområde 1, so anslag before any header are
 *    collected into an implicit "1 Rikets styrelse" group.
 *    One ExpenseGroup per utgiftsområde; rows are the anslag with a 1-based
 *    ordinal id in document order (the official anslag number "grupp:nr"
 *    does not fit a plain numeric id).
 *
 *  Inkomster — code-based hierarchy, two layouts:
 *    2023+: group/typ header rows carry a numeric code in col A; the leaf
 *      inkomsttitel rows carry their code in col B with the name in col C.
 *    2022: every row carries its code (as text) in col A with the name in
 *      col B; leaves are the codes that do not end in 0 (undergrupp 1110,
 *      huvudgrupp 1100 and typ 1000 do). The sheet has no title row and
 *      labels the total "Statens budget, inkomster (kassamässigt)".
 *    In both, the inkomsttyp row (code divisible by 1000) comes AFTER its
 *    content and carries the typ total; the amount is the last numeric
 *    cell of the row. One RevenueGroup per inkomsttyp (id_start/id_end =
 *    its code range); rows are the inkomsttitlar with the official code as
 *    id. Huvudgrupp/undergrupp levels remain derivable from code prefixes.
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

const TITLE_RE = /^Specifikation av budgetens \w+ för (\d{4})$/;
const EXPENSE_TOTAL_LABEL = "Summa anslag";
const REVENUE_TOTAL_LABELS = new Set(["Summa inkomster", "Statens budget, inkomster (kassamässigt)"]);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Some files (2023, 2025) carry float noise such as -168015517.00000003. */
const tkr = (v: number) => Math.round(v * 100) / 100;

const num = (cell: Cell | undefined, context: string): number => {
  if (typeof cell?.value !== "number") throw new Error(`Expected a number for ${context}, got ${JSON.stringify(cell?.value)}`);
  return cell.value;
};

/** A 4-digit inkomst code, whether the cell holds a number or text. */
const code4 = (value: string | number | undefined): number | undefined => {
  const s = String(value ?? "").trim();
  return /^\d{4}$/.test(s) ? +s : undefined;
};

const str = (cell: Cell | undefined): string | undefined =>
  typeof cell?.value === "string" && clean(cell.value) ? clean(cell.value) : undefined;

/** The last numeric cell in a row, which is where every layout puts the amount. */
const lastNumber = (row: (Cell | undefined)[]): number | undefined => {
  for (let i = row.length - 1; i >= 0; i--) {
    const v = row[i]?.value;
    if (typeof v === "number") return v;
  }
  return undefined;
};

/** Locates the "Specifikation av budgetens … för <år>" title; returns its cell position. */
function findTitle(sheet: Sheet): { year: number; col: number } | undefined {
  for (const row of sheet) {
    if (!row) continue;
    for (const [col, cell] of row.entries()) {
      if (typeof cell?.value !== "string") continue;
      const year = clean(cell.value).match(TITLE_RE)?.[1];
      if (year) return { year: +year, col };
    }
  }
  return undefined;
}

export type ParsedBudget = { year: number; budget: BudgetJson; warnings: string[] };

function parseExpenses(sheet: Sheet, warnings: string[]): { groups: ExpenseGroup[]; total: number } {
  // The number/name/total columns start where the title cell is; without a
  // title, fall back to the column left of the "Summa anslag" label.
  let offset = findTitle(sheet)?.col;
  if (offset === undefined) {
    for (const row of sheet) {
      const col = row?.findIndex((c) => str(c) === EXPENSE_TOTAL_LABEL) ?? -1;
      if (col > 0) {
        offset = col - 1;
        break;
      }
    }
  }
  if (offset === undefined) throw new Error(`Utgifter: could not locate the "${EXPENSE_TOTAL_LABEL}" column`);

  const groups: ExpenseGroup[] = [];
  let total: number | undefined;
  let current: ExpenseGroup | undefined;
  let implicitFirst = false;
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
    const [a, b, c] = [row[offset], row[offset + 1], row[offset + 2]];
    const name = str(b);
    if (!name || TITLE_RE.test(name)) continue;

    if (name === EXPENSE_TOTAL_LABEL) {
      total = num(c, `"${EXPENSE_TOTAL_LABEL}"`);
      continue;
    }

    const areaNumber = a?.value;
    if (areaNumber !== undefined && String(areaNumber).trim() !== "" && Number.isFinite(+areaNumber)) {
      closeBoldGroup();
      current = { uo: +areaNumber, title: name, total: num(c, `utgiftsområde ${+areaNumber}`), rows: [] };
      groups.push(current);
      continue;
    }

    if (typeof c?.value !== "number") continue;
    if (!current) {
      // 2023: the workbook omits the header row for utgiftsområde 1.
      current = { uo: 1, title: "Rikets styrelse", total: 0, rows: [] };
      groups.push(current);
      implicitFirst = true;
      warnings.push('Utgifter: no header row for utgiftsområde 1; assuming "Rikets styrelse" with the sum of its anslag as total');
    }
    if (b!.bold) {
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

  if (total === undefined) throw new Error(`Utgifter: no "${EXPENSE_TOTAL_LABEL}" row found`);
  if (groups.length === 0) throw new Error("Utgifter: no utgiftsområden found");
  if (implicitFirst) {
    const first = groups[0]!;
    first.total = first.rows.reduce((s, r) => s + r.expense, 0);
    if (groups[1] && groups[1].uo !== 2) {
      throw new Error(`Utgifter: anslag before the first utgiftsområde header, but the first header is utgiftsområde ${groups[1].uo}`);
    }
  }
  for (const group of groups) {
    const sum = group.rows.reduce((s, r) => s + r.expense, 0);
    if (sum !== group.total) {
      throw new Error(`Utgifter: utgiftsområde ${group.uo} totals ${group.total} but its anslag sum to ${sum}`);
    }
  }
  const sum = groups.reduce((s, g) => s + g.total, 0);
  if (sum !== total) throw new Error(`Utgifter: "${EXPENSE_TOTAL_LABEL}" is ${total} but the utgiftsområden sum to ${sum}`);
  return { groups, total };
}

function parseRevenues(sheet: Sheet): { groups: RevenueGroup[]; total: number } {
  // 2023+ put leaf codes in col B next to a name in col C; 2022 puts every
  // code in col A and marks the hierarchy level with the code itself.
  const leafCodeInColB = sheet.some((row) => code4(row?.[1]?.value) !== undefined && str(row?.[2]) !== undefined);

  const groups: RevenueGroup[] = [];
  let pending: RevenueRow[] = [];
  let total: number | undefined;

  for (const row of sheet) {
    if (!row) continue;
    const [a, b, c] = row;

    const label = str(a);
    if (label && REVENUE_TOTAL_LABELS.has(label)) {
      const amount = lastNumber(row);
      if (amount === undefined) throw new Error(`Expected a number for "${label}"`);
      total = tkr(amount);
      continue;
    }

    let header: { code: number; title: string } | undefined;
    let leaf: { code: number; title: string } | undefined;
    if (leafCodeInColB) {
      const headerCode = code4(a?.value);
      const leafCode = code4(b?.value);
      if (headerCode !== undefined && str(b)) header = { code: headerCode, title: str(b)! };
      else if (leafCode !== undefined && str(c)) leaf = { code: leafCode, title: str(c)! };
    } else {
      const code = code4(a?.value);
      if (code !== undefined && str(b)) {
        if (code % 10 === 0) header = { code, title: str(b)! };
        else leaf = { code, title: str(b)! };
      }
    }

    // Inkomsttyp rows (code divisible by 1000) follow their content and
    // close the group; huvudgrupp- and undergrupp headers (and the textual
    // range headers such as "1140-1160") are presentational and skipped.
    if (header) {
      if (header.code % 1000 === 0) {
        const amount = lastNumber(row);
        if (amount === undefined) throw new Error(`Expected a number for inkomsttyp ${header.code}`);
        groups.push({ title: header.title, id_start: header.code, id_end: header.code + 999, total: tkr(amount), rows: pending });
        pending = [];
      }
      continue;
    }

    if (leaf) {
      const amount = lastNumber(row);
      if (amount === undefined) continue;
      pending.push({ id: leaf.code, title: leaf.title, revenue: tkr(amount) });
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
export function parseBudgetWorkbook(bytes: Uint8Array): ParsedBudget {
  const sheets = readWorkbook(bytes);
  const utgifter = sheets.get("Utgifter");
  const inkomster = sheets.get("Inkomster");
  if (!utgifter || !inkomster) {
    throw new Error(`Expected sheets "Utgifter" and "Inkomster", found: ${[...sheets.keys()].join(", ")}`);
  }

  // The 2022 Inkomster sheet has no title; one titled sheet is enough.
  const expenseYear = findTitle(utgifter)?.year;
  const revenueYear = findTitle(inkomster)?.year;
  if (expenseYear !== undefined && revenueYear !== undefined && expenseYear !== revenueYear) {
    throw new Error(`Sheet years disagree: Utgifter says ${expenseYear}, Inkomster says ${revenueYear}`);
  }
  const year = expenseYear ?? revenueYear;
  if (year === undefined) throw new Error('Could not find a "Specifikation av budgetens ... för <år>" title in either sheet');

  const warnings: string[] = [];
  const expenses = parseExpenses(utgifter, warnings);
  const revenues = parseRevenues(inkomster);

  const budget = BudgetJsonSchema.parse({
    expenses: expenses.groups,
    revenues: revenues.groups,
    expensesTotal: expenses.total,
    revenuesTotal: revenues.total,
  });
  return { year, budget, warnings };
}
