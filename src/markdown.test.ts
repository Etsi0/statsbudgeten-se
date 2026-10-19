import { describe, expect, test } from "bun:test";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  test("plain text", () => {
    expect(parseInline("Hej där")).toEqual([{ t: "text", s: "Hej där" }]);
  });

  test("links, bold and code in running text", () => {
    expect(parseInline("Se [sajten](https://x.se) och **viktigt** samt `kod`.")).toEqual([
      { t: "text", s: "Se " },
      { t: "link", s: "sajten", href: "https://x.se" },
      { t: "text", s: " och " },
      { t: "strong", s: "viktigt" },
      { t: "text", s: " samt " },
      { t: "code", s: "kod" },
      { t: "text", s: "." },
    ]);
  });

  test("mailto links", () => {
    expect(parseInline("[mejl](mailto:a@b.se)")).toEqual([{ t: "link", s: "mejl", href: "mailto:a@b.se" }]);
  });
});

describe("parseMarkdown", () => {
  test("headings, paragraphs, lists and the sources marker", () => {
    const md = ["# Titel", "", "## Del", "Rad ett", "rad två.", "", "- punkt **ett**", "- punkt [två](https://t.se)", "", "[sources]", "", "Sist."].join("\n");
    expect(parseMarkdown(md)).toEqual([
      { t: "h", level: 1, inlines: [{ t: "text", s: "Titel" }] },
      { t: "h", level: 2, inlines: [{ t: "text", s: "Del" }] },
      { t: "p", inlines: [{ t: "text", s: "Rad ett rad två." }] },
      {
        t: "ul",
        items: [
          [{ t: "text", s: "punkt " }, { t: "strong", s: "ett" }],
          [{ t: "text", s: "punkt " }, { t: "link", s: "två", href: "https://t.se" }],
        ],
      },
      { t: "sources" },
      { t: "p", inlines: [{ t: "text", s: "Sist." }] },
    ]);
  });

  test("a list directly after a paragraph closes the paragraph", () => {
    expect(parseMarkdown("Text\n- a\n- b\nMer").map((b) => b.t)).toEqual(["p", "ul", "p"]);
  });

  test("handles Windows line endings and trailing whitespace", () => {
    expect(parseMarkdown("# A  \r\n\r\nB\r\n")).toEqual([
      { t: "h", level: 1, inlines: [{ t: "text", s: "A" }] },
      { t: "p", inlines: [{ t: "text", s: "B" }] },
    ]);
  });

  test("the shipped about page parses and has the expected sections", async () => {
    const text = await Bun.file(`${import.meta.dir}/../content/om.md`).text();
    const blocks = parseMarkdown(text);
    const headings = blocks.filter((b) => b.t === "h").map((b) => (b.t === "h" ? b.inlines.map((i) => i.s).join("") : ""));
    expect(headings[0]).toBe("Om Statsbudgeten");
    expect(headings).toContain("Källor");
    expect(blocks.some((b) => b.t === "sources")).toBe(true);
    const links = blocks.flatMap((b) => (b.t === "p" ? b.inlines : b.t === "ul" ? b.items.flat() : [])).filter((i) => i.t === "link");
    expect(links.map((l) => (l.t === "link" ? l.href : ""))).toEqual(
      expect.arrayContaining(["https://proddalbert.se", "mailto:albert@proddalbert.se"]),
    );
  });
});
