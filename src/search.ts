/**
 * Search over one budget year: utgiftsområden, inkomsttyper and all their
 * postings. Matching is case- and diacritic-insensitive (so "forsvar" finds
 * "Försvar") and every word of the query must occur in the posting's title
 * or in its group's code or title. Hits on the title itself rank above hits
 * that only match through the group, and larger amounts rank first within
 * each tier.
 */
import type { BudgetJson } from "../types/BudgetJsonSchema";

export type View = "exp" | "rev";

export type SearchHit = {
  view: View;
  /** Internal group key such as "uo6" or "ink1000". */
  gkey: string;
  /** URL group number: utgiftsområde number or inkomsttyp code. */
  group: number;
  groupCode: string;
  groupTitle: string;
  /** Row id, or null when the hit is the group itself. */
  id: number | null;
  /** Row key used by the app (title for expenses, id for revenues), or null for a group. */
  key: string | null;
  title: string;
  /** The posting sits in the group's "Övriga" bundle. */
  rest: boolean;
  v: number;
};

/** Lower-case and strip diacritics: "Försvar" → "forsvar". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Share of a group below which postings are bundled into "Övriga" (mirrors the treemap). */
const TAIL_CUT = 0.006;

export function buildIndex(b: BudgetJson): SearchHit[] {
  const hits: SearchHit[] = [];
  const addGroup = (view: View, gkey: string, group: number, groupCode: string, groupTitle: string, total: number, rows: { id: number; key: string; title: string; v: number }[]) => {
    hits.push({ view, gkey, group, groupCode, groupTitle, id: null, key: null, title: groupTitle, rest: false, v: total });
    const positive = rows.filter((r) => r.v > 0);
    const sum = positive.reduce((s, r) => s + r.v, 0) || 1;
    const tail = new Set(positive.filter((r) => r.v / sum < TAIL_CUT).map((r) => r.key));
    const useTail = tail.size > 1;
    for (const r of rows) {
      hits.push({ view, gkey, group, groupCode, groupTitle, id: r.id, key: r.key, title: r.title, rest: useTail && tail.has(r.key), v: r.v });
    }
  };
  for (const g of b.expenses) {
    addGroup("exp", `uo${g.uo}`, g.uo, `UO ${g.uo}`, g.title, g.total, g.rows.map((r) => ({ id: r.id, key: r.title, title: r.title, v: r.expense })));
  }
  for (const g of b.revenues) {
    addGroup("rev", `ink${g.id_start}`, g.id_start, String(g.id_start), g.title, g.total, g.rows.map((r) => ({ id: r.id, key: String(r.id), title: r.title, v: r.revenue })));
  }
  return hits;
}

export function search(index: SearchHit[], query: string, limit = 50): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const hit of index) {
    const title = fold(hit.title);
    const group = fold(`${hit.groupCode} ${hit.groupTitle}`);
    const idText = hit.id != null ? String(hit.id) : "";
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (title.startsWith(w)) score += 3;
      else if (title.includes(w)) score += 2;
      else if (group.includes(w) || idText === w) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ hit, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.hit.v - a.hit.v)
    .slice(0, limit)
    .map((s) => s.hit);
}
