# Midnight Pine Desktop App UI

This folder contains the branded desktop launcher UI.

## Runtime Configuration

`app.js` supports global overrides:

- `window.MPR_SERVER_IP` (FiveM connect target)
- `window.MPR_API_BASE` (integration API base URL)
- `window.MPR_API_TOKEN` (optional token for `/desktop/overview`)

Use `config.example.js` as a template for a local `config.js`.

If you create `config.js`, load it before `app.js` in `index.html`.

## Backend Endpoint

The UI polls:

- `GET /desktop/overview`

from `core/integration/webhookServer.js` every 30 seconds.

If `DESKTOP_APP_TOKEN` is set in `.env`, the request must provide it (query `token` and/or header `x-desktop-token`).

## Relevant Environment Variables

- `INTEGRATION_PORT` (default `8787`)
- `DESKTOP_APP_TOKEN` (optional, recommended)
- `AC_SERVER_MAIN_URL`
- `AC_SERVER_TRAFFIC_URL`

The overview endpoint is read-only and safe to consume from the launcher.
