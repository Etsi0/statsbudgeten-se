import { describe, expect, test } from "bun:test";
import { BudgetJsonSchema, type BudgetJson } from "../types/BudgetJsonSchema";
import { InflationSchema } from "../types/InflationSchema";
import { HEIGHT, WIDTH, cssColor, pageDescription, pageTitle, renderPng, renderSvg, routeForImage, socialImagePath, textWidth, type Data } from "./social";
import { parseRoute } from "./web/routes";

const root = new URL("..", import.meta.url).pathname;

/** The repo's real data, as the server loads it. */
async function loadData(): Promise<Data> {
  const years = [...new Bun.Glob("data/[0-9][0-9][0-9][0-9].json").scanSync(root)]
    .map((p) => Number(p.match(/(\d{4})\.json$/)?.[1]))
    .sort((a, b) => b - a);
  const budgets: Record<number, BudgetJson> = {};
  for (const y of years) budgets[y] = BudgetJsonSchema.parse(await Bun.file(`${root}data/${y}.json`).json());
  const inflation = InflationSchema.parse(await Bun.file(`${root}data/inflation.json`).json());
  return { years, budgets, rates: inflation.rates };
}

const data = await loadData();
const latest = Math.max(...data.years);
const url = (s: string) => new URL(s, "https://statsbudgeten.se");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Uint8Array) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

describe("image URLs", () => {
  test("every chart page has an image, about and search do not", () => {
    expect(socialImagePath(url("/"))).toBe("/social/oversikt.png");
    expect(socialImagePath(url("/utgifter"))).toBe("/social/utgifter.png");
    expect(socialImagePath(url("/inkomster/1000/1111"))).toBe("/social/inkomster/1000/1111.png");
    expect(socialImagePath(url("/utgifter/6/ovriga/23?year=2024&inflation=1&andel=inkomster"))).toBe("/social/utgifter/6/ovriga/23.png?year=2024&inflation=1&andel=inkomster");
    expect(socialImagePath(url("/om"))).toBeNull();
    expect(socialImagePath(url("/sok?q=försvar"))).toBeNull();
  });

  test("an image URL maps back to its page", () => {
    for (const page of ["/", "/utgifter", "/inkomster/1000/1111", "/utgifter/6/ovriga/23?year=2024&inflation=1&andel=inkomster"]) {
      const image = socialImagePath(url(page))!;
      expect(routeForImage(url(image))).toEqual(parseRoute(url(page)));
    }
  });

  test("other paths under /social/ are not images", () => {
    expect(routeForImage(url("/social/om.png"))).toBeNull();
    expect(routeForImage(url("/social/oversikt.jpg"))).toBeNull();
    expect(routeForImage(url("/social/../social.png"))).toBeNull();
    expect(routeForImage(url("/social/utgifter/6.png/extra.png"))).toBeNull();
  });
});

describe("titles", () => {
  test("mirror the app's document title", () => {
    expect(pageTitle(parseRoute(url("/")), data)).toBe("Inkomster och utgifter");
    expect(pageTitle(parseRoute(url("/om")), data)).toBe("Om sajten");
    expect(pageTitle(parseRoute(url("/sok?q=skola")), data)).toBe("Sök: skola");
    expect(pageTitle(parseRoute(url("/utgifter")), data)).toBe(`Alla utgiftsområden · Utgifter ${latest}`);
    const g = data.budgets[latest]!.expenses[0]!;
    expect(pageTitle(parseRoute(url(`/utgifter/${g.uo}`)), data)).toBe(`${g.title} · Utgifter ${latest}`);
    const r = g.rows[0]!;
    expect(pageTitle(parseRoute(url(`/utgifter/${g.uo}/${r.id}`)), data)).toBe(`${r.title} · ${g.title} · Utgifter ${latest}`);
  });

  test("an unknown year or group falls back like the app", () => {
    expect(pageTitle(parseRoute(url("/utgifter/999?year=1999")), data)).toBe(`Alla utgiftsområden · Utgifter ${latest}`);
  });

  test("descriptions name the figures", () => {
    expect(pageDescription(parseRoute(url("/")), data)).toMatch(/^Statens budget \d{4}: utgifter .* mdkr, inkomster .* mdkr, saldo /);
    expect(pageDescription(parseRoute(url("/utgifter")), data)).toMatch(/utgiftsområden\.$/);
    expect(pageDescription(parseRoute(url("/om")), data)).toBeNull();
  });
});

describe("rendering", () => {
  const pages = ["/", "/utgifter", "/inkomster", "/utgifter/6", "/utgifter/6/ovriga", "/inkomster/1000", "/?inflation=1&andel=utgifter", `/utgifter?year=${Math.min(...data.years)}`];

  test.each(pages)("%s draws a 1200×630 PNG", (page) => {
    const png = renderPng(parseRoute(url(page)), data);
    expect(png).not.toBeNull();
    expect([...png!.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngSize(png!)).toEqual({ w: WIDTH, h: HEIGHT });
  });

  test("a focused posting gets its history and a ring on its tile", () => {
    const g = data.budgets[latest]!.expenses.find((x) => x.uo === 6) ?? data.budgets[latest]!.expenses[0]!;
    const r = [...g.rows].sort((a, b) => b.expense - a.expense)[0]!;
    const svg = renderSvg(parseRoute(url(`/utgifter/${g.uo}/${r.id}`)), data)!;
    expect(svg).toContain(`UO ${g.uo} · ${g.title}`);
    expect(svg).toContain('fill="none" stroke=');
  });

  test("the SVG uses no oklch colours, which resvg cannot draw", () => {
    for (const page of pages) expect(renderSvg(parseRoute(url(page)), data)).not.toContain("oklch");
  });

  test("no data, no image", () => {
    expect(renderPng(parseRoute(url("/")), { years: [], budgets: {}, rates: {} })).toBeNull();
  });
});

describe("helpers", () => {
  test("oklch converts to sRGB", () => {
    expect(cssColor("oklch(1 0 0)")).toBe("#ffffff");
    expect(cssColor("oklch(0 0 0)")).toBe("#000000");
    expect(cssColor("oklch(0.627955 0.257683 29.2339)")).toBe("#ff0000");
    expect(cssColor("#abcdef")).toBe("#abcdef");
  });

  test("text width scales with size and weight", () => {
    expect(textWidth("Försvar", 20)).toBeGreaterThan(textWidth("Försvar", 10));
    expect(textWidth("Försvar", 20, 700)).toBeGreaterThan(textWidth("Försvar", 20));
    expect(textWidth("iii", 20)).toBeLessThan(textWidth("mmm", 20));
  });
});
