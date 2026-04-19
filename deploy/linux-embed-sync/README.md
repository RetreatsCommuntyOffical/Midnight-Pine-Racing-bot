# Lynex Linux Embed Sync Service

This service runs on your Linux server and exposes one endpoint used by your bot:

- GET /api/discord/embeds

The bot polls this endpoint and creates/updates Discord embeds by key.

## 1) Copy files to Linux

Copy this folder to Linux, for example:

- /opt/midnight-linux-embed-sync

## 2) Install Node dependencies

From that folder:

- npm install

## 3) Configure environment

Create a .env file in the same folder:

- PORT=8080
- LINUX_SYNC_TOKEN=<long-random-secret>
- EMBEDS_FILE=/opt/midnight-linux-embed-sync/embeds.json

## 4) Start manually (quick test)

- npm start

Health check:

- curl http://127.0.0.1:8080/health

Expected:

- {"ok":true,"service":"linux-embed-sync"}

Endpoint check with token:

- curl -H "Authorization: Bearer <LINUX_SYNC_TOKEN>" http://127.0.0.1:8080/api/discord/embeds

## 5) Create systemd service

Create file:

- /etc/systemd/system/midnight-linux-embed-sync.service

Content:

[Unit]
Description=Midnight Linux Embed Sync API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/midnight-linux-embed-sync
EnvironmentFile=/opt/midnight-linux-embed-sync/.env
ExecStart=/usr/bin/node /opt/midnight-linux-embed-sync/server.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target

Enable and start:

- sudo systemctl daemon-reload
- sudo systemctl enable midnight-linux-embed-sync
- sudo systemctl start midnight-linux-embed-sync
- sudo systemctl status midnight-linux-embed-sync

## 6) Firewall (if needed)

If your bot host reaches Linux over network, open the port:

- sudo ufw allow 8080/tcp

If bot and endpoint are on same private network, restrict to private IP ranges only.

## 7) Wire your bot .env

In your bot project .env:

- LINUX_SYNC_ENABLED=true
- LINUX_SYNC_URL=http://<lynex-ip-or-domain>:8080/api/discord/embeds
- LINUX_SYNC_TOKEN=<same-token-as-linux>
- LINUX_SYNC_INTERVAL_SEC=180
- LINUX_SYNC_TIMEOUT_MS=10000

## 8) Force command and sync test

From bot project:

- npm run deploy:commands
- npm start

In Discord (admin):

- /linux-sync status
- /linux-sync run

Success should report total/created/updated/skipped and no auth errors.

## Embed payload format

Edit embeds.json with this shape:

{
  "embeds": [
    {
      "key": "unique-embed-key",
      "channelName": "🏁┃welcome",
      "title": "Embed title",
      "description": "Embed body",
      "color": 3066993,
      "fields": [
        { "name": "Field name", "value": "Field value", "inline": false }
      ],
      "footerText": "Midnight Pine Racing",
      "imageUrl": "",
      "thumbnailUrl": ""
    }
  ]
}

Notes:

- key must be unique and stable forever for update-in-place behavior.
- Use either channelName or channelId.
- If payload does not change, bot skips update.
