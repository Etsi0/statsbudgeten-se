import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BudgetJsonSchema, type BudgetJson } from "../../types/BudgetJsonSchema";
import "./styles.css";

const exact = new Intl.NumberFormat("sv-SE");
const oneDecimal = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Amounts in the data are in tkr (thousands of SEK); 1 mdkr = 1e6 tkr. */
const asMdkr = (tkr: number) => oneDecimal.format(tkr / 1e6);
const asTkr = (tkr: number) => `${exact.format(tkr)} tkr`;
const asShare = (part: number, whole: number) =>
  `${percent.format((part / whole) * 100)} %`;

type TooltipData = {
  x: number;
  y: number;
  title: string;
  value: string;
  share: string;
};

function Tooltip({ data }: { data: TooltipData }) {
  const flip = data.x > window.innerWidth - 340;
  return (
    <div
      className="tooltip"
      role="status"
      style={{
        left: flip ? undefined : data.x + 14,
        right: flip ? window.innerWidth - data.x + 14 : undefined,
        top: Math.min(data.y + 14, window.innerHeight - 90),
      }}
    >
      <div className="tt-title">{data.title}</div>
      <div className="tt-value">{data.value}</div>
      <div className="tt-share">{data.share}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="detail">{detail}</div>
    </div>
  );
}

type BarItem = {
  key: string;
  label: string;
  value: number;
  rows: { id: number; title: string; value: number }[];
};

function BarList({
  items,
  total,
  color,
  track,
  shareLabel,
  rowKindLabel,
}: {
  items: BarItem[];
  total: number;
  color: string;
  track: string;
  shareLabel: string;
  rowKindLabel: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Shared zero baseline: negative bars (e.g. avräkningar) grow leftward from it.
  const maxPos = Math.max(0, ...items.map((i) => i.value));
  const maxNeg = Math.max(0, ...items.map((i) => -i.value));
  const span = maxPos + maxNeg || 1;
  const zeroPct = (maxNeg / span) * 100;

  const show = (item: BarItem, x: number, y: number) =>
    setTooltip({
      x,
      y,
      title: item.label,
      value: asTkr(item.value),
      share: `${asShare(item.value, total)} ${shareLabel}`,
    });

  return (
    <div onMouseLeave={() => setTooltip(null)}>
      {items.map((item) => {
        const isOpen = expanded === item.key;
        const rows = [...item.rows].sort((a, b) => b.value - a.value);
        return (
          <React.Fragment key={item.key}>
            <button
              type="button"
              className="bar-row"
              aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : item.key)}
              onMouseMove={(e) => show(item, e.clientX, e.clientY)}
              onFocus={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                show(item, r.left + r.width / 2, r.bottom);
              }}
              onBlur={() => setTooltip(null)}
            >
              <span className="bar-label">{item.label}</span>
              <span
                className="bar-track"
                style={{ ["--track" as string]: track }}
                aria-hidden
              >
                {item.value >= 0 ? (
                  <span
                    className="bar-fill"
                    style={{
                      left: `${zeroPct}%`,
                      width: `${(item.value / span) * 100}%`,
                      ["--fill" as string]: color,
                    }}
                  />
                ) : (
                  <span
                    className="bar-fill negative"
                    style={{
                      right: `${100 - zeroPct}%`,
                      width: `${(-item.value / span) * 100}%`,
                      ["--fill" as string]: color,
                    }}
                  />
                )}
              </span>
              <span className="bar-value">
                {asMdkr(item.value)} <span className="unit">mdkr</span>
              </span>
            </button>
            {isOpen && (
              <div className="detail-wrap">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th className="num">Nr</th>
                      <th>{rowKindLabel}</th>
                      <th className="num">Belopp (tkr)</th>
                      <th className="num">Andel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="num">{row.id}</td>
                        <td>{row.title}</td>
                        <td className="num">{exact.format(row.value)}</td>
                        <td className="num">{asShare(row.value, item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </React.Fragment>
        );
      })}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}

function App() {
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/years")
      .then((r) => r.json() as Promise<string[]>)
      .then((ys) => {
        setYears(ys);
        setYear(ys[0] ?? null);
        if (ys.length === 0)
          setError("Inga budgetfiler hittades i data/. Kör `bun run convert` först.");
      })
      .catch(() => setError("Kunde inte hämta tillgängliga år."));
  }, []);

  useEffect(() => {
    if (!year) return;
    setBudget(null);
    fetch(`/api/budget/${year}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json) => setBudget(BudgetJsonSchema.parse(json)))
      .catch(() => setError(`Kunde inte läsa budgeten för ${year}.`));
  }, [year]);

  const expenseItems = useMemo<BarItem[]>(
    () =>
      (budget?.expenses ?? [])
        .map((g) => ({
          key: `uo-${g.uo}`,
          label: `UO ${g.uo} · ${g.title}`,
          value: g.total,
          rows: g.rows.map((r) => ({ id: r.id, title: r.title, value: r.expense })),
        }))
        .sort((a, b) => b.value - a.value),
    [budget],
  );

  const revenueItems = useMemo<BarItem[]>(
    () =>
      (budget?.revenues ?? [])
        .map((g) => ({
          key: `inkomst-${g.id_start}`,
          label: g.title,
          value: g.total,
          rows: g.rows.map((r) => ({ id: r.id, title: r.title, value: r.revenue })),
        }))
        .sort((a, b) => b.value - a.value),
    [budget],
  );

  const saldo = budget ? budget.revenuesTotal - budget.expensesTotal : 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Statsbudgeten</h1>
        <span className="subtitle">Sveriges statsbudget i siffror</span>
        {years.length > 0 && (
          <select
            className="year-select"
            aria-label="Budgetår"
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </header>

      {error && <p className="status-msg">{error}</p>}
      {!error && !budget && <p className="status-msg">Läser in budgeten …</p>}

      {budget && (
        <>
          <div className="kpi-row">
            <StatTile
              label={`Utgifter ${year}`}
              value={`${asMdkr(budget.expensesTotal)} mdkr`}
              detail={`${budget.expenses.length} utgiftsområden, ${budget.expenses.reduce((s, g) => s + g.rows.length, 0)} anslag`}
            />
            <StatTile
              label={`Inkomster ${year}`}
              value={`${asMdkr(budget.revenuesTotal)} mdkr`}
              detail={`${budget.revenues.length} inkomsttyper, ${budget.revenues.reduce((s, g) => s + g.rows.length, 0)} inkomsttitlar`}
            />
            <StatTile
              label="Saldo"
              value={`${saldo > 0 ? "+" : "−"}${asMdkr(Math.abs(saldo))} mdkr`}
              detail={saldo < 0 ? "Underskott – lånebehov" : "Överskott"}
            />
          </div>

          <section className="chart-card">
            <h2>Utgifter per utgiftsområde</h2>
            <p className="chart-sub">
              Miljarder kronor. Klicka på ett område för att se dess anslag.
            </p>
            <BarList
              items={expenseItems}
              total={budget.expensesTotal}
              color="var(--expense)"
              track="var(--expense-track)"
              shareLabel="av utgifterna"
              rowKindLabel="Anslag"
            />
          </section>

          <section className="chart-card">
            <h2>Inkomster per inkomsttyp</h2>
            <p className="chart-sub">
              Miljarder kronor. Klicka på en inkomsttyp för att se dess inkomsttitlar.
            </p>
            <BarList
              items={revenueItems}
              total={budget.revenuesTotal}
              color="var(--revenue)"
              track="var(--revenue-track)"
              shareLabel="av inkomsterna"
              rowKindLabel="Inkomsttitel"
            />
          </section>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
