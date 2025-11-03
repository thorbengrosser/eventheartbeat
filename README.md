# EventMobi Real-time Dashboard Extension

A real-time animated dashboard extension for EventMobi that visualizes event activity with colorful bubble animations when attendees check into events or sessions.

## Features

- Real-time attendee count display
- Session and event check-in tracking
- Animated bubble notifications: "NAME just checked into [EVENT/SESSION NAME]"
- Fullscreen mode for event displays
- Optional sound effects
- "Symphony" sound mode: step through an ABC tune (one note per check-in)
- WebSocket-based real-time updates via EventMobi webhooks

## Tech Stack

- **Backend**: Flask, Flask-SocketIO, Python
- **Frontend**: React, Socket.IO client
- **API**: EventMobi API v4

## Setup

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Set up the virtual environment and install dependencies:

**On macOS/Linux:**
```bash
./setup.sh
```

**On Windows:**
```bash
setup.bat
```

**Or manually:**
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

3. Run the Flask server:
```bash
# Make sure virtual environment is activated
source venv/bin/activate  # On Windows: venv\Scripts\activate

python app.py
```

The backend will run on `http://localhost:5001` (default port changed from 5000 to avoid conflict with macOS AirPlay Receiver)

**Note:** Always activate the virtual environment before running the server. You'll see `(venv)` in your terminal prompt when it's active.

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

### Webhook Setup for Development

For local development, you'll need to expose your Flask server to the internet so EventMobi can send webhooks. Use ngrok:

```bash
ngrok http 5001
```

**Note:** Port 5001 is used by default to avoid conflicts with macOS AirPlay Receiver on port 5000. You can change the port by setting the `PORT` environment variable.

Copy the HTTPS URL provided by ngrok and use it when registering webhooks.

## Usage

1. Start both backend and frontend servers
2. Open the frontend in your browser
3. Enter your EventMobi API key
4. Select an event from the dropdown
5. The dashboard will initialize and register webhooks
6. Use fullscreen mode for live event displays
7. Toggle sound effects on/off as needed

## Production Deployment

You can deploy using Docker (single container). The container serves the Flask API and WebSockets and also serves the built React app as static files.

### Build and run with Docker

```bash
# From repo root
docker build -t em-live-checkins:latest .
docker run --rm -p 5001:5001 \
  -e SECRET_KEY=change-me \
  -e CORS_ORIGINS="https://eventheartbeat.thorben.io,http://localhost:3000" \
  -e WEBHOOK_BASE_URL="https://eventheartbeat.thorben.io" \
  --name em-live-checkins em-live-checkins:latest
```

The app will be available on http://localhost:5001. In production you will place Apache in front and proxy to the container.

### Apache reverse proxy (WebSockets aware)

Enable required modules:

```bash
a2enmod proxy proxy_http proxy_wstunnel headers rewrite
```

Example vhost snippet:

```
<VirtualHost *:80>
  ServerName eventheartbeat.thorben.io

  # Redirect to HTTPS if you terminate TLS at Apache
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteRule ^/?(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
  ServerName eventheartbeat.thorben.io

  # SSL config here (certs)...

  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"

  # API and SPA
  ProxyPass        / http://127.0.0.1:5001/
  ProxyPassReverse / http://127.0.0.1:5001/

  # WebSockets for Socket.IO
  ProxyPass        /socket.io/ http://127.0.0.1:5001/socket.io/ retry=0 timeout=300 Keepalive=On
  ProxyPassReverse /socket.io/ http://127.0.0.1:5001/socket.io/

  # Upgrade headers
  RewriteEngine On
  RewriteCond %{HTTP:Upgrade} =websocket [NC]
  RewriteRule /(.*)           ws://127.0.0.1:5001/$1 [P,L]
  RewriteCond %{HTTP:Upgrade} !=websocket [NC]
  RewriteRule /(.*)           http://127.0.0.1:5001/$1 [P,L]
</VirtualHost>
```

Set environment variables in your container runner or Docker Compose. The server does not store API keys; the browser sends them with each request.

## API Endpoints

- `POST /api/setup` - Validate API key and fetch events
- `GET /api/events` - List available events
- `GET /api/event/{event_id}/stats` - Get current statistics
- `GET /api/event/{event_id}/active-sessions` - Get active/nearby sessions with check-in counts
- `POST /webhook/eventmobi` - Receive webhook events from EventMobi
- `POST /api/event/{event_id}/register-webhook` - Register webhook with EventMobi
- `GET /api/songs` - List available `.abc` songs from backend/abc
- `GET /api/songs/{filename}` - Fetch raw ABC for a song

## Symphony Mode

- Place `.abc` files in `backend/abc/` (two examples included).
- In Settings → Preferences, choose Sound mode "Symphony" and select a song.
- Each check-in plays the next note; when the tune ends it loops from the start.

