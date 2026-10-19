/**
 * Web interface for browsing the budget JSON files in data/.
 *
 * Usage: bun --hot src/server.ts  (or `bun run web`)
 */
import index from "./web/index.html";
import { InflationSchema } from "../types/InflationSchema";

const root = new URL("..", import.meta.url).pathname;

/** Years that have a data/<year>.json file, newest first. */
function listYears(): number[] {
  return [...new Bun.Glob("data/[0-9][0-9][0-9][0-9].json").scanSync(root)]
    .map((p) => Number(p.match(/(\d{4})\.json$/)?.[1]))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    // The app owns these paths; they mirror the drill state (src/web/routes.ts).
    "/utgifter": index,
    "/utgifter/*": index,
    "/inkomster": index,
    "/inkomster/*": index,
    "/api/years": () => Response.json(listYears()),
    "/api/inflation": async () => {
      const file = Bun.file(`${root}data/inflation.json`);
      if (!(await file.exists())) return Response.json({ rates: {} });
      const parsed = InflationSchema.safeParse(await file.json());
      if (!parsed.success) {
        console.warn("data/inflation.json är ogiltig, ignoreras:", parsed.error.message);
        return Response.json({ rates: {} });
      }
      return Response.json(parsed.data, { headers: { "cache-control": "public, max-age=3600" } });
    },
    "/api/budget/:year": async (req) => {
      const { year } = req.params;
      if (!/^\d{4}$/.test(year)) return new Response("Bad year", { status: 400 });
      const file = Bun.file(`${root}data/${year}.json`);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file, {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
      });
    },
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Statsbudgeten på ${server.url}`);
