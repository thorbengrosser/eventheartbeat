# EventMobi Heartbeat

An experimental, living dashboard that turns EventMobi check-ins into sound and motion. Paste your API key, pick an event, and watch check-ins pulse across the screen.

## Features

- Real-time attendee counts and session/event check-ins
- Animated bubble notifications per check-in
- Fullscreen display mode
- Optional sound effects
- Symphony mode: step through an ABC tune (one note per check-in)
- WebSocket-based real-time updates via EventMobi webhooks

## Tech Stack

- **Backend**: Flask, Flask-SocketIO, Python
- **Frontend**: React, Socket.IO client
- **API**: EventMobi API v4

## Quick Start

### Backend
```bash
cd backend
./setup.sh                # Windows: setup.bat
python -m backend.app     # http://localhost:5001
```

### Frontend
```bash
cd frontend
npm install
HOST=127.0.0.1 PORT=3001 npm start   # proxies API to :5001
```
If your environment restricts host binding, try:
```bash
WDS_ALLOWED_HOSTS=localhost DANGEROUSLY_DISABLE_HOST_CHECK=true HOST=localhost PORT=3001 npm start
```

### Webhooks (local dev)
Expose the backend with ngrok so EventMobi can reach your webhook:
```bash
ngrok http 5001
```
Copy the HTTPS URL from ngrok and paste it into “Webhook Base URL” during setup. Webhook registration is best‑effort; the app also refreshes data periodically.

## Usage

1) Start Page
- Paste your EventMobi API key. The key stays in your browser (sessionStorage by default or localStorage if you tick “Keep my key on this device”).
- Optional: watch the 45s demo or open Questions/Imprint.

2) Setup → Select Event
- Choose your event and optionally set a webhook base URL (ngrok or deployment URL).

3) Dashboard
- Bubbles and sound react to check-ins in real time. Use Settings to tweak visuals and sound modes (Heartbeat/Symphony). Fullscreen supported.

## Production Deployment

Build and run with Docker from repo root:
```bash
docker build -t em-live-checkins:latest .
docker run --rm -p 5001:5001 \
  -e SECRET_KEY=change-me \
  -e CORS_ORIGINS="https://eventheartbeat.thorben.io,http://localhost:3001" \
  -e WEBHOOK_BASE_URL="https://eventheartbeat.thorben.io" \
  -e APP_DEBUG=false \
  -e REACT_APP_API_URL="https://eventheartbeat.thorben.io" \
  --name em-live-checkins em-live-checkins:latest
```
The app will be available on http://localhost:5001. In production, place Apache/Nginx in front and proxy to the container. Socket.IO lives at `/socket.io/`.

### Apache reverse proxy (WebSockets aware)
Enable required modules:
```bash
a2enmod proxy proxy_http proxy_wstunnel headers rewrite
```
Example vhost snippet:
```
<VirtualHost *:80>
  ServerName eventheartbeat.thorben.io
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteRule ^/?(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
  ServerName eventheartbeat.thorben.io

  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"

  # API and SPA
  ProxyPass        / http://127.0.0.1:5001/
  ProxyPassReverse / http://127.0.0.1:5001/

  # WebSockets for Socket.IO
  ProxyPass        /socket.io/ http://127.0.0.1:5001/socket.io/ retry=0 timeout=300 Keepalive=On
  ProxyPassReverse /socket.io/ http://127.0.0.1:5001/socket.io/

  RewriteEngine On
  RewriteCond %{HTTP:Upgrade} =websocket [NC]
  RewriteRule /(.*)           ws://127.0.0.1:5001/$1 [P,L]
  RewriteCond %{HTTP:Upgrade} !=websocket [NC]
  RewriteRule /(.*)           http://127.0.0.1:5001/$1 [P,L]
</VirtualHost>
```

## API Endpoints (browser sends API key with each request)

- `POST /api/setup` - Validate API key and fetch events
- `GET /api/events` - List available events
- `GET /api/event/{event_id}/stats` - Get current statistics
- `GET /api/event/{event_id}/active-sessions` - Get active/nearby sessions with check-in counts (up to 15, newest first)
- `POST /webhook/eventmobi` - Receive webhook events from EventMobi
- `POST /api/event/{event_id}/register-webhook` - Register webhook with EventMobi
- `GET /api/songs` - List available `.abc` songs from backend/abc
- `GET /api/songs/{filename}` - Fetch raw ABC for a song

## Symphony Mode

- Place `.abc` files in `backend/abc/` (two examples included).
- In Settings → Preferences, choose Sound mode "Symphony" and select a song.
- Each check-in plays the next note; when the tune ends it loops from the start.

