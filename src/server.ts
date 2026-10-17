/**
 * Web interface for browsing the budget JSON files in data/.
 *
 * Usage: bun --hot src/server.ts  (or `bun run web`)
 */
import index from "./web/index.html";

const root = new URL("..", import.meta.url).pathname;

function listYears(): string[] {
  return [...new Bun.Glob("data/*.json").scanSync(root)]
    .map((p) => p.match(/(\d{4})\.json$/)?.[1])
    .filter((y): y is string => !!y)
    .sort()
    .reverse();
}

const server = Bun.serve({
  routes: {
    "/": index,
    "/api/years": () => Response.json(listYears()),
    "/api/budget/:year": async (req) => {
      const { year } = req.params;
      if (!/^\d{4}$/.test(year)) return new Response("Bad year", { status: 400 });
      const file = Bun.file(`${root}data/${year}.json`);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file, { headers: { "content-type": "application/json" } });
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Statsbudgeten på ${server.url}`);
