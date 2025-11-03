# Quick Setup Guide

## Backend Setup

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

# Activate virtual environment (required each time)
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

3. Run the Flask server:
```bash
# IMPORTANT: Always activate the virtual environment first!
source venv/bin/activate  # On Windows: venv\Scripts\activate

python app.py
```

Backend will run on `http://localhost:5001` (port changed from 5000 to avoid macOS AirPlay Receiver conflict)

**Note:** The virtual environment must be activated each time you open a new terminal to run the backend. You'll see `(venv)` in your terminal prompt when it's active.

## Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the React development server:
```bash
npm start
```

Frontend will run on `http://localhost:3000`

## Symphony Sound Mode

- Add your `.abc` files to `backend/abc/`.
- The backend exposes:
  - `GET /api/songs` to list available songs
  - `GET /api/songs/<filename>` to fetch the ABC text
- In the dashboard Settings → Preferences:
  - Enable sound
  - Choose Sound mode = Symphony
  - Pick a song
- Each check-in triggers the next note in the tune; it loops when complete.

## Webhook Setup (for Development)

For local development, you'll need to expose your Flask server to receive webhooks from EventMobi.

1. Install ngrok (if not already installed):
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/
```

2. Start ngrok tunnel:
```bash
ngrok http 5001
```

**Note:** The backend uses port 5001 by default to avoid conflicts with macOS AirPlay Receiver on port 5000.

3. Copy the HTTPS URL provided by ngrok (e.g., `https://abc123.ngrok.io`)

4. When setting up the dashboard:
   - Enter your EventMobi API key
   - Select your event
   - In the "Webhook Base URL" field, enter your ngrok URL (e.g., `https://abc123.ngrok.io`)

## Using the Dashboard

1. Open `http://localhost:3000` in your browser
2. Enter your EventMobi API key (found in EventMobi Experience Manager under Integrations)
3. Select an event from the dropdown
4. Optionally enter your webhook base URL (ngrok URL for local development)
5. Click "Start Dashboard"
6. The dashboard will initialize and display real-time stats
7. Use the fullscreen button (⤢) to enter fullscreen mode
8. Toggle sound on/off with the speaker button (🔊/🔇)

## Troubleshooting

- **Webhook registration fails**: This is okay! The dashboard will still work, but you may need to set up webhooks manually in EventMobi.
- **No real-time updates**: Check that:
  - Webhooks are properly configured in EventMobi
  - Your webhook URL is publicly accessible
  - The backend server is running and receiving webhook requests
- **Connection issues**: Check that both backend and frontend servers are running, and that the API URL is correct in `frontend/src/components/Dashboard.jsx` and `frontend/src/components/Setup.jsx`

