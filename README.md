# statsbudgeten-se

To install dependencies:

```bash
bun install
```

To convert the official xlsx files in `examples/` to JSON in `data/`:

```bash
bun run convert
```

To convert SCB's inflation workbook in `examples/inflation.xlsx` to `data/inflation.json`
(powers the "Justera för inflation" toggle):

```bash
bun run convert-inflation
```

To start the web interface (a click-to-drill treemap over the budget data) on http://localhost:3000:

```bash
bun run web
```

The server lists every `data/YYYY.json` it finds. With more than one year present, the
year picker lets you switch budget year and every area/item gets a history line chart.

The URL mirrors what is on screen (`src/web/routes.ts`):

| URL | View |
|---|---|
| `/` | Overview: inkomster vs utgifter per year |
| `/utgifter`, `/inkomster` | Treemap of all utgiftsområden / inkomsttyper |
| `/utgifter/6` | Utgiftsområde 6: its history graph above the treemap of its anslag |
| `/utgifter/6/3` | …with anslag 3 focused, so the graph shows that anslag |
| `/utgifter/6/ovriga`, `/utgifter/6/ovriga/23` | The "Övriga" bundle of the group, optionally with a focused anslag |
| `/inkomster/1000/1111` | Inkomsttyp 1000 with inkomsttitel 1111 focused |
| `…?year=2024` | Budget year (omitted for the latest year) |
| `…?inflation=1` | Amounts adjusted for inflation |

## Analytics

Google Analytics is wired up in `src/web/analytics.ts` (measurement ID at the
top of the file). It is not loaded on localhost. The app keeps the URL in step
with what is on screen without page loads, so each URL change is reported as a
page view, and flipping the inflation toggle is an event.

## Deploying to Fly.io

The repo ships with a `fly.toml` (app `statsbudgeten-se`, region `arn`/Stockholm) and a `Dockerfile`. First time: `fly launch --no-deploy` to create the app under your account (or `fly apps create statsbudgeten-se`), then:

```bash
fly deploy
```

The server respects `PORT` and disables dev mode when `NODE_ENV=production` (both set by the Fly config).

This project was created using `bun init` in bun v1.4.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
