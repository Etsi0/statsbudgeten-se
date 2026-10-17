/**
 * Converts budget specification xlsx files to JSON in data/<year>.json.
 *
 * Usage: bun run convert [file.xlsx ...]   (defaults to every xlsx in examples/)
 */
import { parseBudgetWorkbook } from "./parseBudget";

let paths = Bun.argv.slice(2);
if (paths.length === 0) {
  paths = [...new Bun.Glob("examples/*.xlsx").scanSync(import.meta.dir + "/..")].sort();
}
if (paths.length === 0) {
  console.error("No xlsx files given and none found in examples/");
  process.exit(1);
}

for (const path of paths) {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const { year, budget } = parseBudgetWorkbook(bytes);
  const outPath = `data/${year}.json`;
  await Bun.write(outPath, JSON.stringify(budget, null, 2) + "\n");
  const anslag = budget.expenses.reduce((s, g) => s + g.rows.length, 0);
  const titlar = budget.revenues.reduce((s, g) => s + g.rows.length, 0);
  console.log(
    `${path} -> ${outPath}: ${budget.expenses.length} utgiftsområden (${anslag} anslag, ` +
      `totalt ${budget.expensesTotal} tkr), ${budget.revenues.length} inkomsttyper ` +
      `(${titlar} inkomsttitlar, totalt ${budget.revenuesTotal} tkr)`,
  );
}
