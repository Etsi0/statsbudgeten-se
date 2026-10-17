# The Data Folder

Contains the JSON files generated from the official excel files.

Generate with:

```sh
bun run convert                  # converts every xlsx in examples/
bun run convert path/to/file.xlsx
```

Each workbook is written to `data/<year>.json` (the year is read from the
sheet titles) and validated against `BudgetJsonSchema` before being written.
