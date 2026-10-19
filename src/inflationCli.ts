/**
 * Converts SCB's inflation workbook to data/inflation.json.
 *
 * Usage: bun run convert-inflation [file.xlsx]   (defaults to examples/inflation.xlsx)
 */
import { parseInflationWorkbook } from "./parseInflation";

const path = Bun.argv[2] ?? `${import.meta.dir}/../examples/inflation.xlsx`;
const file = Bun.file(path);
if (!(await file.exists())) {
  console.error(`No such file: ${path}`);
  process.exit(1);
}

const inflation = parseInflationWorkbook(new Uint8Array(await file.arrayBuffer()));
const outPath = `${import.meta.dir}/../data/inflation.json`;
await Bun.write(outPath, JSON.stringify(inflation, null, 2) + "\n");

const years = Object.keys(inflation.rates).map(Number);
console.log(
  `${path} -> data/inflation.json: ${years.length} år (${Math.min(...years)}–${Math.max(...years)}), ` +
    `senast ${Math.max(...years)}: ${inflation.rates[String(Math.max(...years))]} %`,
);
