# Budget Schema

The budget schemas is defined in `types/BudgetRowSchema.ts` and `types/BudgetJsonSchema.ts`.


All numbers are in Tkr (i.e "Tusentals kronor")

## Mapping from the official xlsx

The source workbooks ("Specifikation av budgetens utgifter och inkomster",
regeringen.se) are converted by `src/parseBudget.ts`:

- **Expenses** — one `ExpenseGroup` per utgiftsområde (`uo` 1–27). `rows` are
  the individual anslag with `id` as a 1-based ordinal within the
  utgiftsområde (the official anslag number "grupp:nr" is not a plain number)
  and the leading number stripped from the title. The workbook's bold
  anslag-group subtotal rows are excluded from `rows` but verified against
  the anslag sums during parsing.
- **Revenues** — one `RevenueGroup` per inkomsttyp (codes 1000–9000);
  `id_start`/`id_end` is the typ's code range (e.g. 1000–1999). `rows` are
  the leaf inkomsttitlar with the official 4-digit code as `id`; huvudgrupp
  (1100) and undergrupp (1110) remain derivable from the code prefixes.
- `expensesTotal` = the sheet's "Summa anslag" row, `revenuesTotal` =
  "Summa inkomster".

All sums are validated at every level. Expenses add up exactly; the official
file rounds each revenue level to Tkr independently, so revenue totals are
allowed to differ from the sum of their rows by up to 2 Tkr (the 2026 file
has genuine ±1 differences at inkomsttyp 1000, 7000 and "Summa inkomster").