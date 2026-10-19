# statsbudgeten-se

To install dependencies:

```bash
bun install
```

To convert the official xlsx files in `examples/` to JSON in `data/`:

```bash
bun run convert
```

To start the web interface (a click-to-drill treemap over the budget data) on http://localhost:3000:

```bash
bun run web
```

The server lists every `data/YYYY.json` it finds. With more than one year present, the
year picker lets you switch budget year and every area/item gets a history line chart.

## Analytics

Google Analytics is wired up in `src/web/analytics.ts` (measurement ID at the
top of the file). It is not loaded on localhost. Since the app is a single page,
each drill state (tab, year, area, Övriga) is reported as a virtual page view,
and opening a history chart or flipping the inflation toggle are events.

## Deploying to Fly.io

The repo ships with a `fly.toml` (app `statsbudgeten-se`, region `arn`/Stockholm) and a `Dockerfile`. First time: `fly launch --no-deploy` to create the app under your account (or `fly apps create statsbudgeten-se`), then:

```bash
fly deploy
```

The server respects `PORT` and disables dev mode when `NODE_ENV=production` (both set by the Fly config).

This project was created using `bun init` in bun v1.4.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
