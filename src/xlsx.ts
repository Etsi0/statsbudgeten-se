/**
 * Minimal XLSX (SpreadsheetML) reader — just enough for the Swedish state
 * budget specification workbooks: sheet names, shared strings, numeric and
 * string cell values, and whether each cell's font is bold (the budget
 * sheets use bold to mark grouping rows).
 *
 * No external dependencies: the zip container is parsed directly and
 * entries are inflated with node:zlib.
 */
import { inflateRawSync } from "node:zlib";

export interface Cell {
  value: string | number;
  bold: boolean;
}

/** Sparse grid indexed as rows[rowIndex][colIndex], both 0-based. */
export type Sheet = (Cell | undefined)[][];

const utf8 = new TextDecoder();

function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // End-of-central-directory record, scanning backwards past any comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record)");

  const entryCount = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt zip: bad central directory entry");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLength));

    // The local header's name/extra lengths can differ from the central ones.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(data)));
    else throw new Error(`Unsupported zip compression method ${method} for ${name}`);

    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(+dec))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function columnIndex(ref: string): number {
  let col = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    col = col * 26 + ch.charCodeAt(0) - 64;
  }
  return col - 1;
}

/** styleIndex -> is the font bold, derived from styles.xml. */
function parseBoldStyles(stylesXml: string): boolean[] {
  const fontsBlock = stylesXml.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? "";
  const fontBold = [...fontsBlock.matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m) => m[1]!.includes("<b/>"));
  const xfsBlock = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  return [...xfsBlock.matchAll(/<xf\b[^>]*>/g)].map((m) => fontBold[+(attr(m[0], "fontId") ?? 0)] ?? false);
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    // Concatenate all <t> text nodes (plain or inside rich-text runs).
    [...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]!)).join(""),
  );
}

function parseSheet(xml: string, sharedStrings: string[], boldByStyle: boolean[]): Sheet {
  const rows: Sheet = [];
  for (const rowMatch of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: (Cell | undefined)[] = [];
    rows[+rowMatch[1]! - 1] = cells;
    for (const cellMatch of rowMatch[2]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1]!;
      const inner = cellMatch[2];
      if (inner === undefined) continue; // empty cell
      const ref = attr(tag, "r");
      if (!ref) continue;
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (raw === undefined) continue;
      const type = attr(tag, "t");
      let value: string | number;
      if (type === "s") value = sharedStrings[+raw] ?? "";
      else if (type === "str" || type === "b" || type === "e") value = decodeXml(raw);
      else value = +raw;
      const bold = boldByStyle[+(attr(tag, "s") ?? 0)] ?? false;
      cells[columnIndex(ref)] = { value, bold };
    }
  }
  return rows;
}

/** Reads an xlsx workbook into sheets keyed by their visible sheet name. */
export function readWorkbook(bytes: Uint8Array): Map<string, Sheet> {
  const files = unzip(bytes);
  const text = (name: string): string => {
    const data = files.get(name);
    if (!data) throw new Error(`Missing ${name} in workbook`);
    return utf8.decode(data);
  };

  const boldByStyle = parseBoldStyles(text("xl/styles.xml"));
  const sharedStrings = parseSharedStrings(files.has("xl/sharedStrings.xml") ? text("xl/sharedStrings.xml") : undefined);

  // Resolve sheet name -> worksheet part via the workbook relationships.
  const relTargets = new Map<string, string>();
  for (const rel of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(rel[0], "Id");
    const target = attr(rel[0], "Target");
    if (id && target) relTargets.set(id, target.replace(/^\//, "").replace(/^(?!xl\/)/, "xl/"));
  }

  const sheets = new Map<string, Sheet>();
  for (const sheetTag of text("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(sheetTag[0], "name");
    const relId = attr(sheetTag[0], "r:id");
    const target = relId && relTargets.get(relId);
    if (!name || !target) continue;
    sheets.set(decodeXml(name), parseSheet(text(target), sharedStrings, boldByStyle));
  }
  return sheets;
}
