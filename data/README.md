# The Data Folder

Contains the JSON files generated from the official excel files.

Generate with:

```sh
bun run convert                  # converts every xlsx in examples/
bun run convert path/to/file.xlsx
```

Each workbook is written to `data/<year>.json` (the year is read from the
sheet titles) and validated against `BudgetJsonSchema` before being written.

## inflation.json

Optional. Annual inflation in percent per year, used by the web interface's
"Justera för inflation" toggle, which re-expresses every amount in the latest
budget year's prices:

```json
{
  "description": "...",
  "source": "SCB, KPI årsmedeltal",
  "rates": { "2023": 8.5, "2024": 2.8, "2025": 0.5, "2026": 2.0 }
}
```

`rates[Y]` is the change in the consumer price index from year Y−1 to year Y.
Converting year A into year B's prices chains the rates for A+1 … B, so the
base (latest) year needs no rate of its own but every year between does. Years
that cannot be converted are shown nominal and marked with `*` while the
toggle is on. With no usable rates the toggle is hidden.
