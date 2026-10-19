/**
 * Statsbudgeten – a full-screen, click-to-drill treemap over the Swedish state
 * budget. Port of the design reference in design/Statsbudgeten v2.dc.html.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BudgetJsonSchema, type BudgetJson } from "../../types/BudgetJsonSchema";
import "./styles.css";

// ---- Design-only tweaks (constants in production) ----------------------------

/** "färg" | "gråskala" */
const COLOR_MODE: "färg" | "gråskala" = "färg";
/** Bundle rows below 0.6 % of their group into one "Övriga" tile. */
const GROUP_SMALL = true;

const TAIL_CUT = GROUP_SMALL ? 0.006 : 0;
const INK = "#0b0b0b";
const PAPER = "#fcfcfb";

// ---- Formatting ---------------------------------------------------------------

const NF1 = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF0 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** Amounts are in tkr; 1 mdkr = 1e6 tkr. */
const fmd = (tkr: number) => {
  const m = tkr / 1e6;
  if (m >= 10) return `${NF0.format(m)} mdkr`;
  if (m >= 0.1) return `${NF1.format(m)} mdkr`;
  return `${NF0.format(tkr / 1e3)} mnkr`;
};
const fpct = (p: number) => `${p >= 10 ? NF0.format(p) : p >= 0.1 ? NF1.format(p) : "<0,1"} %`;

// ---- Data model ---------------------------------------------------------------

type View = "exp" | "rev";
type NormRow = { key: string; id: number; title: string; v: number };
type NormGroup = { key: string; code: string; title: string; total: number; rows: NormRow[] };

/** Normalize expenses and revenues to one shape (see design/README.md › Data). */
function normalize(b: BudgetJson, view: View): NormGroup[] {
  return view === "rev"
    ? b.revenues.map((g) => ({
        key: `ink${g.id_start}`,
        code: String(g.id_start),
        title: g.title,
        total: g.total,
        rows: g.rows.map((r) => ({ key: String(r.id), id: r.id, title: r.title, v: r.revenue })),
      }))
    : b.expenses.map((g) => ({
        key: `uo${g.uo}`,
        code: `UO ${g.uo}`,
        title: g.title,
        total: g.total,
        rows: g.rows.map((r) => ({ key: r.title, id: r.id, title: r.title, v: r.expense })),
      }));
}

const COPY = {
  exp: {
    item: "Anslag",
    items: "anslag",
    areas: "utgiftsområden",
    rest: "Övriga mindre anslag",
    all: "statens utgifter",
    root: "Alla utgiftsområden",
    kind: "Utgiftsområde",
    heading: "Statens utgifter",
  },
  rev: {
    item: "Inkomsttitel",
    items: "inkomsttitlar",
    areas: "inkomsttyper",
    rest: "Övriga inkomsttitlar",
    all: "statens inkomster",
    root: "Alla inkomsttyper",
    kind: "Inkomsttyp",
    heading: "Statens inkomster",
  },
} as const;

// ---- Squarified treemap -------------------------------------------------------

type Placed<T> = { it: T; a: number; x: number; y: number; w: number; h: number };

function squarify<T>(items: { it: T; a: number }[], W: number, H: number): Placed<T>[] {
  const out: Placed<T>[] = [];
  let rest = items.slice();
  let x = 0, y = 0, w = W, h = H;
  const worst = (row: { a: number }[], s: number) => {
    const sum = row.reduce((acc, r) => acc + r.a, 0);
    const mx = Math.max(...row.map((r) => r.a));
    const mn = Math.min(...row.map((r) => r.a));
    return Math.max((s * s * mx) / (sum * sum), (sum * sum) / (s * s * mn));
  };
  while (rest.length) {
    const s = Math.min(w, h);
    const row = [rest[0]!];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]!], s) <= worst(row, s)) {
      row.push(rest[i]!);
      i++;
    }
    rest = rest.slice(i);
    const sum = row.reduce((acc, r) => acc + r.a, 0);
    if (w >= h) {
      const cw = sum / h;
      let cy = y;
      for (const r of row) {
        const rh = r.a / cw;
        out.push({ ...r, x, y: cy, w: cw, h: rh });
        cy += rh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const r of row) {
        const rw = r.a / rh;
        out.push({ ...r, x: cx, y, w: rw, h: rh });
        cx += rw;
      }
      y += rh;
      h -= rh;
    }
  }
  return out;
}

// ---- Shared types -------------------------------------------------------------

type Info = { title: string; value?: string; share?: string; hint?: string };
type Rect = { left: string; top: string; width: string; height: string };
type HistRef = { view: View; gkey: string; row: string | null; kicker: string };
type Hist = HistRef & Rect & { title: string; bg: string; fg: string };

type Item = {
  key: string;
  code: string;
  label: string;
  v: number;
  hue: number;
  lv?: number;
  rank: number;
  drill?: boolean;
  rest?: boolean;
  histRef?: HistRef;
  onClick?: () => void;
};

// ---- Icons --------------------------------------------------------------------

const ClockIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// ---- Tile ---------------------------------------------------------------------

type TileProps = {
  it: Item;
  rect: Rect;
  w: number;
  h: number;
  bg: string;
  fg: string;
  share: string;
  info: Info;
  hovered: boolean;
  showIcons: boolean;
  onHover: (info: Info | null) => void;
  onActivate: () => void;
  onHistory: () => void;
};

function Tile({ it, rect, w, h, bg, fg, share, info, hovered, showIcons, onHover, onActivate, onHistory }: TileProps) {
  const minD = Math.min(w, h);
  const area = w * h;
  const showLabel = w > 84 && h > 54;
  const showValue = w > 70 && h > 130;
  const shareSize = Math.round(Math.max(18, Math.min(64, Math.sqrt(area) / 5.2)));
  const titleSize = minD > 220 ? 18 : minD > 130 ? 15 : w < 130 ? 12 : 13;
  const clamp = h > 170 ? 3 : h > 80 ? 2 : 1;
  const light = fg === INK;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${info.title}, ${info.value}`}
      className={`tile${hovered ? " hovered" : ""}`}
      style={{
        ...rect,
        background: bg,
        color: fg,
        padding: minD > 160 ? "14px 16px" : "8px 10px",
        cursor: it.drill ? "zoom-in" : "default",
        ["--icon-bg" as string]: light ? "rgba(11,11,11,0.08)" : "rgba(255,255,255,0.18)",
      }}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      onMouseEnter={() => onHover(info)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(info)}
      onBlur={() => onHover(null)}
    >
      {showIcons && (
        <div className="icons">
          <button
            type="button"
            className="icon-btn"
            title="Visa historik"
            aria-label={`Visa historik för ${it.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onHistory();
            }}
          >
            <ClockIcon />
          </button>
        </div>
      )}
      <span className="head" style={{ opacity: showLabel ? 1 : 0, paddingRight: showIcons ? 34 : 0 }}>
        <span className="code">{it.code}</span>
        <span className="title" lang="sv" style={{ fontSize: titleSize, WebkitLineClamp: clamp }}>
          {it.label}
        </span>
      </span>
      <span className="figures" style={{ opacity: showValue ? 1 : 0 }}>
        <span className="share" style={{ fontSize: shareSize }}>
          {share}
        </span>
        <span className="value">{fmd(it.v)}</span>
      </span>
    </div>
  );
}

// ---- History overlay ----------------------------------------------------------

type HistoryProps = {
  hist: Hist;
  open: boolean;
  years: number[];
  budgets: Record<number, BudgetJson>;
  year: number;
  onClose: () => void;
};

function History({ hist, open, years, budgets, year, onClose }: HistoryProps) {
  const series = years.map((y) => {
    const b = budgets[y];
    const g = b ? normalize(b, hist.view).find((x) => x.key === hist.gkey) : undefined;
    let v = 0;
    if (g) v = hist.row == null ? g.total : (g.rows.find((r) => r.key === hist.row)?.v ?? 0);
    return { y, v };
  });
  const vs = series.map((s) => s.v);
  const mn = Math.min(...vs);
  const mx = Math.max(...vs);
  const pad = Math.max((mx - mn) * 0.25, mx * 0.05, 1);
  let lo = Math.max(0, mn - pad);
  let hi = mx + pad;
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const n = series.length;
  const X = (i: number) => (n === 1 ? 50 : 5 + (i / (n - 1)) * 90);
  const Y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
  const pts = series.map((s, i) => `${X(i).toFixed(2)},${Y(s.v).toFixed(2)}`);
  const grid: { top: string; label: string }[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) {
    grid.push({ top: `${Y(v)}%`, label: (step >= 1e6 ? NF0 : NF1).format(v / 1e6) });
  }
  const first = series[0]!;
  const last = series[n - 1]!;
  const ch = first.v ? ((last.v - first.v) / first.v) * 100 : 0;
  const dark = hist.fg !== INK;

  return (
    <div
      className="hist"
      role="dialog"
      aria-modal="false"
      aria-label={`Historik: ${hist.title}`}
      style={{
        left: open ? "0%" : hist.left,
        top: open ? "0%" : hist.top,
        width: open ? "100%" : hist.width,
        height: open ? "100%" : hist.height,
        borderRadius: open ? 14 : 10,
        background: hist.bg,
        color: hist.fg,
        ["--icon-bg" as string]: dark ? "rgba(255,255,255,0.18)" : "rgba(11,11,11,0.08)",
        ["--grid-color" as string]: dark ? "rgba(255,255,255,0.22)" : "rgba(11,11,11,0.12)",
      }}
    >
      <div
        className="content"
        style={{
          opacity: open ? 1 : 0,
          transform: `translateY(${open ? 0 : 12}px)`,
          transition: `opacity .3s ease ${open ? ".18s" : "0s"}, transform .4s cubic-bezier(.2,.7,.2,1) ${open ? ".18s" : "0s"}`,
        }}
      >
        <div className="top">
          <div className="heading">
            <span className="kicker">{hist.kicker}</span>
            <span className="name" lang="sv">
              {hist.title}
            </span>
          </div>
          <div className="delta">
            <span className="kicker">
              {first.y}–{last.y}
            </span>
            <span className="pct">
              {ch > 0 ? "+" : ch < 0 ? "−" : "±"}
              {NF1.format(Math.abs(ch))} %
            </span>
            <span className="abs">
              {last.v >= first.v ? "+" : "−"}
              {fmd(Math.abs(last.v - first.v))}
            </span>
          </div>
          <button type="button" className="icon-btn close" title="Stäng (Esc)" aria-label="Stäng historik" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="chart">
          {grid.map((g) => (
            <div key={g.top} className="gridline" style={{ top: g.top }}>
              <span>{g.label}</span>
            </div>
          ))}
          <div
            className="reveal"
            style={{
              clipPath: `inset(0 ${open ? "0%" : "100%"} 0 0)`,
              transitionDelay: open ? ".35s" : "0s",
            }}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polygon points={`${X(0)},100 ${pts.join(" ")} ${X(n - 1)},100`} fill="currentColor" style={{ opacity: 0.1 }} />
              <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          {series.map((s, i) => {
            const selected = s.y === year;
            const delay = open ? `${(0.4 + (i / Math.max(1, n - 1)) * 0.8).toFixed(2)}s` : "0s";
            return (
              <div
                key={s.y}
                className="dot"
                style={{
                  left: `${X(i)}%`,
                  top: `${Y(s.v)}%`,
                  transform: `translate(-50%,-50%) scale(${open ? 1 : 0})`,
                  transitionDelay: delay,
                }}
              >
                <span className="val">{fmd(s.v)}</span>
                <span
                  className="mark"
                  style={{
                    width: selected ? 16 : 12,
                    height: selected ? 16 : 12,
                    background: selected ? "currentColor" : hist.bg,
                  }}
                />
              </div>
            );
          })}
          {series.map((s, i) => {
            const selected = s.y === year;
            return (
              <span
                key={s.y}
                className="year"
                style={{ left: `${X(i)}%`, fontWeight: selected ? 700 : 500, opacity: selected ? 1 : 0.7 }}
              >
                {s.y}
              </span>
            );
          })}
        </div>
        <div className="note" />
      </div>
    </div>
  );
}

// ---- App ----------------------------------------------------------------------

function App() {
  const [yrs, setYrs] = useState<number[]>([]);
  const [budgets, setBudgets] = useState<Record<number, BudgetJson>>({});
  const [year, setYear] = useState<number | null>(null);
  const [view, setView] = useState<View>("exp");
  const [uo, setUo] = useState<string | null>(null);
  const [rest, setRest] = useState(false);
  const [hover, setHover] = useState<Info | null>(null);
  const [hist, setHist] = useState<Hist | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [size, setSize] = useState({ W: 1000, H: 600 });
  const [error, setError] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const histTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load the list of years and every budget file (the history chart needs all years).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/years");
        if (!res.ok) throw new Error(String(res.status));
        const years = (await res.json()) as unknown;
        if (!Array.isArray(years) || !years.every((y) => typeof y === "number")) throw new Error("Bad year list");
        const sorted = [...(years as number[])].sort((a, b) => a - b);
        const entries = await Promise.all(
          sorted.map(async (y) => {
            const r = await fetch(`/api/budget/${y}`);
            if (!r.ok) throw new Error(String(r.status));
            return [y, BudgetJsonSchema.parse(await r.json())] as const;
          }),
        );
        if (cancelled) return;
        const latest = sorted[sorted.length - 1];
        setYrs(sorted);
        setBudgets(Object.fromEntries(entries));
        setYear(latest ?? null);
        if (latest == null) setError(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Treemap is laid out in real pixels.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const measure = () => setSize({ W: el.clientWidth || 1000, H: el.clientHeight || 600 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const openHist = useCallback((h: Hist) => {
    clearTimeout(histTimer.current);
    setHist(h);
    setHistOpen(false);
    setHover(null);
    // Two frames so the overlay first paints at the source rect, then animates open.
    requestAnimationFrame(() => requestAnimationFrame(() => setHistOpen(true)));
  }, []);

  const closeHist = useCallback(() => {
    setHistOpen(false);
    clearTimeout(histTimer.current);
    histTimer.current = setTimeout(() => setHist(null), 520);
  }, []);

  useEffect(() => () => clearTimeout(histTimer.current), []);

  // Esc: close history → leave Övriga → back to top level.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (hist) return closeHist();
      if (rest) setRest(false);
      else setUo(null);
      setHover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hist, rest, closeHist]);

  const switchView = (k: View) => {
    if (view === k) return;
    clearTimeout(histTimer.current);
    setView(k);
    setUo(null);
    setRest(false);
    setHover(null);
    setHist(null);
    setHistOpen(false);
  };

  const goRoot = () => {
    setUo(null);
    setRest(false);
    setHover(null);
  };

  const rev = view === "rev";
  const T = COPY[view];
  const B = year != null ? budgets[year] : undefined;
  const multiYear = yrs.length > 1;

  const all = useMemo(() => (B ? normalize(B, view) : []), [B, view]);
  const total = B ? (rev ? B.revenuesTotal : B.expensesTotal) : 0;
  const groups = all.filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
  const hueOf = Object.fromEntries(all.map((g, i) => [g.key, ((i * 360) / all.length + (rev ? 30 : 250)) % 360])) as Record<string, number>;
  const group = uo != null ? all.find((g) => g.key === uo) ?? null : null;
  const gross = groups.reduce((s, g) => s + g.total, 0) || 1;
  const negs = all.filter((g) => g.total < 0);
  const negNote = negs.length
    ? ` · brutto ${fmd(gross)}, minus ${negs.map((g) => `${g.title.toLowerCase()} ${fmd(-g.total)}`).join(", ")}`
    : "";

  // Items at the current drill level.
  let items: Item[] = [];
  let parentTotal = total;
  if (B && !group) {
    items = groups.map((g, i) => ({
      key: g.key,
      code: g.code,
      label: g.title,
      v: g.total,
      hue: hueOf[g.key]!,
      lv: i % 3,
      rank: i / groups.length,
      drill: true,
      histRef: { view, gkey: g.key, row: null, kicker: `${g.code} · ${T.kind}` },
      onClick: () => {
        setUo(g.key);
        setRest(false);
        setHover(null);
      },
    }));
  } else if (B && group) {
    const rows = group.rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    const sum = rows.reduce((s, r) => s + r.v, 0) || 1;
    const big = rows.filter((r) => r.v / sum >= TAIL_CUT);
    const tail = rows.filter((r) => r.v / sum < TAIL_CUT);
    const useTail = tail.length > 1 && !rest;
    const list = rest ? tail : useTail ? big : rows;
    parentTotal = group.total;
    const hue = hueOf[group.key]!;
    items = list.map((r, i) => ({
      key: r.key,
      code: `${T.item} ${r.id ?? ""}`,
      label: r.title,
      v: r.v,
      hue,
      rank: i / Math.max(1, list.length),
      histRef: { view, gkey: group.key, row: r.key, kicker: `${group.code} · ${group.title}` },
    }));
    if (useTail) {
      items.push({
        key: "__rest",
        code: `${tail.length} ${T.items}`,
        label: T.rest,
        v: tail.reduce((s, r) => s + r.v, 0),
        hue,
        rank: 1,
        rest: true,
        drill: true,
        onClick: () => {
          setRest(true);
          setHover(null);
        },
      });
    }
  }

  const { W, H } = size;
  const sumItems = items.reduce((s, it) => s + it.v, 0) || 1;
  const rects = squarify(items.map((it) => ({ it, a: (it.v / sumItems) * W * H })), W, H);

  const groupBg = group
    ? COLOR_MODE === "färg"
      ? `oklch(0.80 0.09 ${hueOf[group.key]})`
      : "oklch(0.86 0.01 260)"
    : "transparent";

  const base: Info = !B
    ? { title: error ? "Kunde inte läsa data" : "Läser in …" }
    : group
      ? {
          title: rest ? T.rest : group.title,
          value: fmd(rest ? sumItems : group.total),
          share: `${fpct(((rest ? sumItems : group.total) / gross) * 100)} av ${T.all} ${year} · ${items.length} block`,
          hint: "Esc för att gå tillbaka",
        }
      : {
          title: `${T.heading} ${year}`,
          value: fmd(total),
          share: `${groups.length} ${T.areas}${negNote}`,
          hint: "Klicka på ett block",
        };
  const info = hover ?? base;

  return (
    <div className="app" lang="sv">
      <div className="menu">
        <span className="brand">Statsbudgeten</span>
        <div className="tabs" role="tablist">
          {(
            [
              ["exp", "Utgifter", "var(--expense)", B?.expensesTotal],
              ["rev", "Inkomster", "var(--revenue)", B?.revenuesTotal],
            ] as const
          ).map(([k, label, dot, tot]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              className={`tab${view === k ? " active" : ""}`}
              onClick={() => switchView(k)}
            >
              <span className="dot" style={{ background: dot }} />
              <span>{label}</span>
              <span className="total">{tot != null ? fmd(tot) : ""}</span>
            </button>
          ))}
        </div>
        <div className="year-picker">
          <span className="label" id="year-label">
            Budgetår
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="year-label">
            {yrs.map((y) => (
              <button
                key={y}
                type="button"
                role="radio"
                aria-checked={y === year}
                className={y === year ? "active" : ""}
                onClick={() => {
                  setYear(y);
                  setHover(null);
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      <header className="crumb-row">
        <nav className="crumbs" aria-label="Brödsmulor">
          <span className="crumb">
            <button type="button" className={group ? "" : "current"} onClick={goRoot} disabled={!group}>
              {T.root}
            </button>
            {group && <span className="sep">/</span>}
          </span>
          {group && (
            <span className="crumb">
              <button
                type="button"
                className={rest ? "" : "current"}
                disabled={!rest}
                onClick={() => {
                  setRest(false);
                  setHover(null);
                }}
              >
                {group.title}
              </button>
              {rest && <span className="sep">/</span>}
            </span>
          )}
          {group && rest && (
            <span className="crumb">
              <button type="button" className="current" disabled>
                Övriga
              </button>
            </span>
          )}
        </nav>
        {group && !rest && multiYear && (
          <button
            type="button"
            className="hist-pill"
            title="Visa historik för hela området"
            style={{ background: groupBg }}
            onClick={() =>
              openHist({
                view,
                gkey: group.key,
                row: null,
                kicker: `${group.code} · ${T.kind}`,
                title: group.title,
                left: "88%",
                top: "0%",
                width: "12%",
                height: "12%",
                bg: groupBg,
                fg: INK,
              })
            }
          >
            <ClockIcon />
            <span>Historik</span>
          </button>
        )}
      </header>

      <div className="map" ref={mapRef}>
        {rects.map(({ it, x, y, w, h }) => {
          let L: number, C: number;
          if (COLOR_MODE === "färg") {
            L = it.rest ? 0.9 : group ? 0.62 + it.rank * 0.28 : 0.74 + (it.lv ?? 0) * 0.04;
            C = it.rest ? 0.02 : group ? 0.13 - it.rank * 0.07 : 0.11;
          } else {
            L = 0.36 + Math.pow(it.rank, 0.7) * 0.54;
            C = 0.02;
          }
          const hue = COLOR_MODE === "färg" ? it.hue : 260;
          const bg = `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue})`;
          const fg = L < 0.66 ? PAPER : INK;
          const shareOfParent = (it.v / parentTotal) * 100;
          const shareOfAll = (it.v / gross) * 100;
          const tileInfo: Info = {
            title: `${it.code ? `${it.code} · ` : ""}${it.label}`,
            value: fmd(it.v),
            share: group
              ? `${fpct(shareOfParent)} av ${group.title.toLowerCase()} · ${fpct(shareOfAll)} av ${T.all}`
              : `${fpct(shareOfAll)} av ${T.all}`,
            hint: it.drill ? "Klicka för att utforska" : "",
          };
          const rect: Rect = {
            left: `${(x / W) * 100}%`,
            top: `${(y / H) * 100}%`,
            width: `${(w / W) * 100}%`,
            height: `${(h / H) * 100}%`,
          };
          const showIcons = !!it.histRef && w > 150 && h > 110 && multiYear;
          return (
            <Tile
              key={it.key}
              it={it}
              rect={rect}
              w={w}
              h={h}
              bg={bg}
              fg={fg}
              share={fpct(group ? shareOfParent : shareOfAll)}
              info={tileInfo}
              hovered={hover?.title === tileInfo.title}
              showIcons={showIcons}
              onHover={setHover}
              onActivate={it.onClick ?? (() => setHover(tileInfo))}
              onHistory={() => it.histRef && openHist({ ...it.histRef, title: it.label, ...rect, bg, fg })}
            />
          );
        })}

        {hist && year != null && (
          <History hist={hist} open={histOpen} years={yrs} budgets={budgets} year={year} onClose={closeHist} />
        )}
      </div>

      <footer className="info" aria-live="polite">
        <span className="title">{info.title}</span>
        <span className="value">{info.value}</span>
        <span className="share">{info.share}</span>
        <span className="hint">{info.hint}</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
