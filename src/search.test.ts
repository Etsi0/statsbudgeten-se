import { beforeAll, describe, expect, test } from "bun:test";
import { BudgetJsonSchema, type BudgetJson } from "../types/BudgetJsonSchema";
import { buildIndex, fold, search, type SearchHit } from "./search";

let index: SearchHit[];
let budget: BudgetJson;

beforeAll(async () => {
  budget = BudgetJsonSchema.parse(await Bun.file(`${import.meta.dir}/../data/2026.json`).json());
  index = buildIndex(budget);
});

describe("fold", () => {
  test("lower-cases and strips diacritics", () => {
    expect(fold("Försvar och Åland")).toBe("forsvar och aland");
  });
});

describe("buildIndex", () => {
  test("has one entry per group and per posting", () => {
    const groups = budget.expenses.length + budget.revenues.length;
    const rows = budget.expenses.reduce((s, g) => s + g.rows.length, 0) + budget.revenues.reduce((s, g) => s + g.rows.length, 0);
    expect(index.length).toBe(groups + rows);
  });

  test("marks small postings as living in the Övriga bundle", () => {
    const uo6 = index.filter((h) => h.gkey === "uo6" && h.id != null);
    const inRest = uo6.filter((h) => h.rest);
    expect(inRest.length).toBeGreaterThan(1);
    // Everything in the bundle is smaller than everything outside it.
    const maxRest = Math.max(...inRest.map((h) => h.v));
    const minBig = Math.min(...uo6.filter((h) => !h.rest && h.v > 0).map((h) => h.v));
    expect(maxRest).toBeLessThan(minBig);
  });
});

describe("search", () => {
  test("empty query gives nothing", () => {
    expect(search(index, "   ")).toEqual([]);
  });

  test("is diacritic-insensitive and ranks title hits first", () => {
    const hits = search(index, "forsvar");
    expect(hits.length).toBeGreaterThan(0);
    expect(fold(hits[0]!.title)).toContain("forsvar");
    expect(hits[0]!.view).toBe("exp");
  });

  test("every word must match somewhere", () => {
    const hits = search(index, "stöd ukraina");
    expect(hits.some((h) => h.title === "Stöd till Ukraina")).toBe(true);
    expect(search(index, "stöd ukraina xyzzy")).toEqual([]);
  });

  test("finds postings through their group and by row id", () => {
    const viaGroup = search(index, "rättsväsendet polis");
    expect(viaGroup.some((h) => h.gkey === "uo4" && /polis/i.test(h.title))).toBe(true);
    const byId = search(index, "1111");
    expect(byId.some((h) => h.view === "rev" && h.id === 1111)).toBe(true);
  });

  test("respects the limit", () => {
    expect(search(index, "a", 5).length).toBe(5);
  });
});
