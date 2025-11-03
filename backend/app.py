from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from backend.eventmobi_client import EventMobiClient
from backend.webhook_handler import WebhookHandler
from backend.config import Config
import os
from urllib.parse import urljoin
from pathlib import Path

app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY
CORS(app, resources={r"/*": {"origins": Config.CORS_ORIGINS}})
socketio = SocketIO(
    app, 
    cors_allowed_origins=Config.CORS_ORIGINS, 
    async_mode='eventlet',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e6,
    logger=True,
    engineio_logger=False
)

# Track rooms joined per socket id for cleanup; do not store API keys
socket_rooms = {}

# Simple cache for check-in data to avoid redundant API calls
# Key: (event_id, entity_type), Value: (data, timestamp)
checkin_cache = {}
CHECKIN_CACHE_TTL = 60  # Cache for 60 seconds

# Directory for ABC songs
ABC_DIR = Path(__file__).resolve().parent / 'abc'
# Path where the React build will be copied in Docker
FRONTEND_BUILD_DIR = Path(__file__).resolve().parent / 'static'


@app.route('/api/setup', methods=['POST'])
def setup():
    """Validate API key and fetch available events"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        api_key = data.get('api_key')
        
        if not api_key:
            return jsonify({'error': 'API key is required'}), 400
        
        client = EventMobiClient(api_key)
        
        # Try to validate and get events
        try:
            events = client.get_events()
            return jsonify({
                'success': True,
                'events': events
            })
        except ValueError:
            return jsonify({'error': 'Invalid API key'}), 401
        except Exception as e:
            import traceback
            print(f"Error fetching events: {e}")
            traceback.print_exc()
            return jsonify({'error': f'Failed to fetch events: {str(e)}'}), 500
            
    except Exception as e:
        import traceback
        print(f"Error in setup endpoint: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@app.route('/api/events', methods=['GET'])
def get_events():
    """List events for authenticated API key"""
    api_key = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not api_key:
        api_key = request.args.get('api_key')
    
    if not api_key:
        return jsonify({'error': 'API key is required'}), 401
    
    try:
        client = EventMobiClient(api_key)
        events = client.get_events()
        return jsonify({'events': events})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/event/<event_id>/details', methods=['GET'])
def get_event_details(event_id):
    """Get event details including name"""
    api_key = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not api_key:
        api_key = request.args.get('api_key')
    
    if not api_key:
        return jsonify({'error': 'API key is required'}), 401
    
    try:
        client = EventMobiClient(api_key)
        event_data = client.get_event_details(event_id)
        
        # Extract event details - API might return data wrapped or directly
        event = event_data
        if isinstance(event_data, dict) and 'data' in event_data:
            event = event_data['data']
        
        # Extract event name from various possible fields
        event_name = (
            event.get('name') or 
            event.get('title') or 
            event.get('event_name') or 
            event.get('label') or 
            ''
        )
        
        return jsonify({
            'id': event.get('id') or event_id,
            'name': event_name,
            'event': event  # Return full event object too
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/event/<event_id>/stats', methods=['GET'])
def get_event_stats(event_id):
    """Get current statistics for an event"""
    api_key = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not api_key:
        api_key = request.args.get('api_key')
    
    if not api_key:
        return jsonify({'error': 'API key is required'}), 401
    
    try:
        client = EventMobiClient(api_key)
        stats = client.get_event_stats(event_id)
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/event/<event_id>/active-sessions', methods=['GET'])
def get_active_sessions(event_id):
    """Get active sessions (happening now or starting in next 30 minutes) with check-in counts"""
    api_key = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not api_key:
        api_key = request.args.get('api_key')
    
    if not api_key:
        return jsonify({'error': 'API key is required'}), 401
    
    try:
        client = EventMobiClient(api_key)
        
        active_sessions = client.get_active_sessions(event_id)
        return jsonify(active_sessions)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/songs', methods=['GET'])
def list_songs():
    """List available .abc songs from backend/abc."""
    try:
        songs = []
        if not ABC_DIR.exists():
            return jsonify(songs)
        for p in sorted(ABC_DIR.glob('*.abc')):
            filename = p.name
            # Derive a friendly name from ABC header T: if present, else filename without extension
            title = None
            try:
                with p.open('r', encoding='utf-8', errors='ignore') as f:
                    for _ in range(10):
                        line = f.readline()
                        if not line:
                            break
                        if line.startswith('T:'):
                            title = line[2:].strip()
                            break
            except Exception:
                title = None
            songs.append({
                'id': filename,
                'name': title or p.stem.replace('_', ' '),
                'filename': filename,
            })
        return jsonify(songs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/songs/<path:filename>', methods=['GET'])
def get_song(filename):
    """Serve raw ABC text for given filename within backend/abc, safely."""
    try:
        # Basic validation: .abc extension only
        if not filename.lower().endswith('.abc'):
            return jsonify({'error': 'Invalid file type'}), 400
        # Resolve path safely within ABC_DIR
        candidate = (ABC_DIR / filename).resolve()
        if not str(candidate).startswith(str(ABC_DIR.resolve())):
            return jsonify({'error': 'Invalid path'}), 400
        if not candidate.exists() or not candidate.is_file():
            return jsonify({'error': 'Not found'}), 404
        content = candidate.read_text(encoding='utf-8', errors='ignore')
        # Return as plain text so frontend can parse
        return app.response_class(content, mimetype='text/plain; charset=utf-8')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/event/<event_id>/register-webhook', methods=['POST'])
def register_webhook(event_id):
    """Register webhook with EventMobi for an event"""
    data = request.get_json()
    api_key = data.get('api_key')
    webhook_base_url = data.get('webhook_base_url') or Config.WEBHOOK_BASE_URL
    
    if not api_key:
        return jsonify({'error': 'API key is required'}), 400
    
    webhook_url = urljoin(webhook_base_url.rstrip('/') + '/', 'webhook/eventmobi')
    
    try:
        client = EventMobiClient(api_key)
        
        # Register webhook for checkins
        print(f"Attempting to register webhook: type=checkins, url={webhook_url}")
        result = client.register_webhook(event_id, webhook_url, 'checkins')
        print(f"Webhook registration result: {result}")
        
        # Verify webhook was created/updated by listing webhooks
        webhook_id = None
        webhook_enabled = False
        if isinstance(result, dict):
            if 'data' in result:
                webhook_data = result['data']
                webhook_id = webhook_data.get('id') if isinstance(webhook_data, dict) else None
                webhook_enabled = webhook_data.get('enabled', True) if isinstance(webhook_data, dict) else True
            elif 'id' in result:
                webhook_id = result['id']
                webhook_enabled = result.get('enabled', True)
        
        # Double-check by listing webhooks
        try:
            webhooks = client._make_request('GET', f'events/{event_id}/webhooks', params={'type': 'checkins'})
            webhook_list = []
            if isinstance(webhooks, list):
                webhook_list = webhooks
            elif isinstance(webhooks, dict):
                webhook_list = webhooks.get('data', []) or webhooks.get('webhooks', [])
            
            print(f"Verified: Found {len(webhook_list)} checkins webhook(s)")
            for wh in webhook_list:
                if wh.get('type') == 'checkins':
                    print(f"  - Webhook ID: {wh.get('id')}, Enabled: {wh.get('enabled')}, URL: {wh.get('callback_url')}")
        except Exception as verify_err:
            print(f"Could not verify webhook: {verify_err}")
        
        return jsonify({
            'success': True,
            'webhook_url': webhook_url,
            'webhook_id': webhook_id,
            'webhook_enabled': webhook_enabled,
            'result': result
        })
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Webhook registration error: {error_msg}")
        traceback.print_exc()
        
        # Return error but don't fail completely - webhook might already be configured
        return jsonify({
            'success': False,
            'error': error_msg,
            'webhook_url': webhook_url,
            'message': 'Webhook registration failed, but it may already be configured. Webhooks may still work if already set up in EventMobi.'
        }), 200  # Return 200 so frontend doesn't treat it as a critical error


@app.route('/webhook/eventmobi', methods=['POST', 'GET'])
def receive_webhook():
    """Receive webhook events from EventMobi and notify subscribed clients."""
    try:
        # Handle GET requests (webhook verification from EventMobi)
        if request.method == 'GET':
            print("Webhook endpoint accessed via GET (verification)")
            return jsonify({'status': 'ok', 'message': 'Webhook endpoint is active'}), 200
        
        # Handle POST requests (actual webhook events)
        print(f"Webhook received! Headers: {dict(request.headers)}")
        print(f"Content-Type: {request.content_type}")
        print(f"Raw data: {request.data[:500] if request.data else 'No data'}")
        
        webhook_data = request.get_json()
        
        if not webhook_data:
            # Some webhooks might send form data
            webhook_data = request.form.to_dict()
            if not webhook_data:
                print("No JSON or form data found")
                return jsonify({'error': 'No data received'}), 400
        
        print(f"Webhook data received: {webhook_data}")
        
        # Process webhook
        event_id = webhook_data.get('event_id')
        webhook_type = webhook_data.get('type')

        # For checkins, emit a lightweight poke to the event room; clients will refetch
        if event_id and webhook_type == 'checkins':
            try:
                payload = {
                    'event_id': event_id,
                    'timestamp': webhook_data.get('change_datetime') or webhook_data.get('timestamp'),
                    'resource_ids': webhook_data.get('resource_ids') or []
                }
                # Poke for clients to refetch
                socketio.emit('checkin_poke', payload, to=str(event_id))
                return jsonify({'success': True, 'message': 'Webhook broadcast sent'}), 200
            except Exception as emit_err:
                print(f"Error broadcasting checkin poke: {emit_err}")
                return jsonify({'success': False, 'message': 'Webhook received but broadcast failed'}), 200

        # For non-checkin or missing event_id, ignore gracefully
        print(f"Webhook ignored or unsupported. Data: {webhook_data}")
        return jsonify({'success': False, 'message': 'Webhook ignored'}), 200
            
    except Exception as e:
        print(f"Error processing webhook: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('connected', {'message': 'Connected to EventMobi dashboard'})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')
    # Cleanup joined rooms tracking if present
    sid = request.sid
    if sid in socket_rooms:
        try:
            for room_id in socket_rooms[sid]:
                try:
                    leave_room(room_id)
                except Exception:
                    pass
        finally:
            del socket_rooms[sid]


@socketio.on('subscribe')
def handle_subscribe(data):
    """Handle client subscription to event updates via rooms"""
    event_id = data.get('event_id')
    if event_id:
        join_room(str(event_id))
        sid = request.sid
        socket_rooms.setdefault(sid, set()).add(str(event_id))
        emit('subscribed', {'event_id': event_id})

@socketio.on('unsubscribe')
def handle_unsubscribe(data):
    """Allow client to leave event room"""
    event_id = data.get('event_id')
    if event_id:
        leave_room(str(event_id))
        sid = request.sid
        if sid in socket_rooms and str(event_id) in socket_rooms[sid]:
            socket_rooms[sid].discard(str(event_id))
            if not socket_rooms[sid]:
                del socket_rooms[sid]

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

@app.route('/api/event/<event_id>/checkin-message', methods=['GET'])
def get_checkin_message(event_id):
    """Build a privacy-friendly check-in message using client's API key.
    Expects query param id=<checkin_id> and optional include person/session details.
    """
    api_key = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not api_key:
        api_key = request.args.get('api_key')
    checkin_id = request.args.get('id')
    if not api_key:
        return jsonify({'error': 'API key is required'}), 401
    if not checkin_id:
        return jsonify({'error': 'checkin id is required'}), 400

    try:
        client = EventMobiClient(api_key)
        # Fetch specific checkin with person info
        checkin_data = client._make_request('GET', f'events/{event_id}/checkin', params={'id': checkin_id, 'include': 'person'})
        checkin = None
        if isinstance(checkin_data, list) and checkin_data:
            checkin = checkin_data[0]
        elif isinstance(checkin_data, dict):
            if 'data' in checkin_data:
                data = checkin_data['data']
                if isinstance(data, list) and data:
                    checkin = data[0]
                elif isinstance(data, dict):
                    checkin = data
            elif 'checkins' in checkin_data:
                data = checkin_data['checkins']
                if isinstance(data, list) and data:
                    checkin = data[0]
                elif isinstance(data, dict):
                    checkin = data

        if not checkin:
            return jsonify({'error': 'Checkin not found'}), 404

        person = checkin.get('person') or {}
        first_name = (person.get('first_name') or '').strip()
        last_name = (person.get('last_name') or '').strip()
        attendee_name = first_name or (person.get('name', '').split(' ')[0] if person.get('name') else '')
        if not attendee_name and person.get('email'):
            # Avoid exposing email fully; take prefix only if needed
            attendee_name = person.get('email').split('@')[0]
        if not attendee_name:
            attendee_name = 'Someone'

        entity_type = checkin.get('entity_type')
        entity_id = checkin.get('entity_id')
        checkin_type = 'session' if entity_type == 'sessions' else 'event'
        location_name = 'your event'
        if checkin_type == 'session' and entity_id:
            try:
                session_data = client._make_request('GET', f'events/{event_id}/sessions', params={'id': entity_id})
                session = None
                if isinstance(session_data, dict) and session_data.get('data'):
                    session = session_data['data'][0]
                elif isinstance(session_data, list) and session_data:
                    session = session_data[0]
                if isinstance(session, dict):
                    location_name = session.get('name') or session.get('title') or 'a session'
                else:
                    location_name = 'a session'
            except Exception:
                location_name = 'a session'

        message = f"{attendee_name} just checked into session \"{location_name}\"" if checkin_type == 'session' else f"{attendee_name} just checked into your event"

        return jsonify({
            'message': message,
            'event_type': 'checkin',
            'attendee_name': attendee_name,
            'checkin_type': checkin_type,
            'location_name': location_name,
            'timestamp': checkin.get('change_datetime'),
            'session_id': entity_id if checkin_type == 'session' else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Serve frontend build (SPA) - only for non-API paths
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    # Do not intercept API or webhook endpoints
    if path.startswith('api/') or path.startswith('webhook/'):
        return jsonify({'error': 'Not found'}), 404
    try:
        if path and (FRONTEND_BUILD_DIR / path).is_file():
            return send_from_directory(FRONTEND_BUILD_DIR, path)
    except Exception:
        pass
    # Fallback to index.html for SPA routing
    index_path = FRONTEND_BUILD_DIR / 'index.html'
    if index_path.exists():
        return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')
    return jsonify({'message': 'Frontend not built'}), 200


if __name__ == '__main__':
    # Use port 5001 by default to avoid conflict with macOS AirPlay Receiver on port 5000
    port = int(os.environ.get('PORT', 5001))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)

