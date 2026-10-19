# The Data Folder

Contains the JSON files generated from the official excel files.

Generate with:

```sh
bun run convert                  # converts every <year>.xlsx in examples/
bun run convert path/to/file.xlsx
```

Each workbook is written to `data/<year>.json` (the year is read from the
sheet titles) and validated against `BudgetJsonSchema` before being written.

## inflation.json

Optional. Annual inflation in percent per year, used by the web interface's
"Justera för inflation" toggle. Generate it from SCB's "Inflation i Sverige
1831–" workbook (xlsx export, the one with a `Data` sheet of År | Inflation |
Prisnivå):

```sh
bun run convert-inflation                 # reads examples/inflation.xlsx
bun run convert-inflation path/to/file.xlsx
```

The toggle re-expresses every amount in the prices of the latest budget year
that has a rate of its own (the budget runs a year ahead of the statistics, so
the newest budget year is usually shown nominal and marked `*`):

```json
{
  "description": "...",
  "source": "SCB, KPI årsmedeltal",
  "rates": { "2023": 8.5, "2024": 2.8, "2025": 0.5, "2026": 2.0 }
}
```

`rates[Y]` is the change in the consumer price index from year Y−1 to year Y.
Converting year A into year B's prices chains the rates for A+1 … B. Years
that cannot be converted are shown nominal and marked with `*` while the
toggle is on. With no usable rates the toggle is hidden.
