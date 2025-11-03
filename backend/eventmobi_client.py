import requests
import os
from typing import List, Dict, Optional
from config import Config


class EventMobiClient:
    """Client for interacting with EventMobi API v4"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = Config.EVENTMOBI_API_BASE_URL
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.eventmobi+json; version=4'
        }
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Make HTTP request to EventMobi API"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        # Handle params separately for query string
        params = kwargs.pop('params', {})
        if params:
            kwargs['params'] = params
            
        # Debug logging (can be enabled via environment variable)
        DEBUG_MODE = os.environ.get('EVENTMOBI_DEBUG', 'false').lower() == 'true'
        if DEBUG_MODE:
            print(f"DEBUG: Making {method} request to: {url}")
            if params:
                print(f"DEBUG: Params: {params}")
            print(f"DEBUG: Headers: {self.headers}")
        
        try:
            response = requests.request(method, url, headers=self.headers, timeout=30, **kwargs)
            
            if DEBUG_MODE:
                print(f"DEBUG: Response status: {response.status_code}")
                print(f"DEBUG: Response headers: {dict(response.headers)}")
                print(f"DEBUG: Response text (first 1000 chars): {response.text[:1000]}")
            
            response.raise_for_status()
            
            # Handle empty responses
            if not response.text.strip():
                return {}
                
            return response.json()
        except requests.exceptions.HTTPError as e:
            # Get response text for debugging
            response_text = e.response.text[:500] if e.response.text else '(empty response)'
            
            if e.response.status_code == 401:
                raise ValueError("Invalid API key")
            elif e.response.status_code == 404:
                raise Exception(f"Resource not found: {endpoint}")
            elif e.response.status_code >= 500:
                raise Exception(f"EventMobi server error: HTTP {e.response.status_code} - {response_text}")
            else:
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get('error') or error_data.get('message') or error_data.get('error_message') or str(e)
                    raise Exception(f"API request failed: {error_msg}")
                except (ValueError, requests.exceptions.JSONDecodeError):
                    # If response is not JSON, return the raw text
                    raise Exception(f"API request failed: HTTP {e.response.status_code} - {response_text}")
        except requests.exceptions.Timeout:
            raise Exception("Request timeout - EventMobi API is not responding")
        except requests.exceptions.RequestException as e:
            raise Exception(f"Connection error: {str(e)}")
    
    def validate_api_key(self) -> bool:
        """Validate the API key by attempting to fetch events"""
        try:
            self.get_events()
            return True
        except ValueError:
            return False
    
    def get_events(self) -> List[Dict]:
        """Fetch list of events for the authenticated organization"""
        data = self._make_request('GET', 'events')
        # API might return events directly or wrapped in a response object
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and 'data' in data:
            return data['data']
        elif isinstance(data, dict) and 'events' in data:
            return data['events']
        return []
    
    def get_event_details(self, event_id: str) -> Dict:
        """Fetch details for a specific event"""
        return self._make_request('GET', f'events/{event_id}')
    
    def get_attendees(self, event_id: str) -> List[Dict]:
        """Fetch list of attendees (people) for an event with pagination"""
        all_attendees = []
        page = 0
        limit = 1000  # Max items per page
        
        while True:
            params = {'page': page, 'limit': limit}
            data = self._make_request('GET', f'events/{event_id}/people', params=params)
            
            # Parse response
            page_attendees = []
            meta = {}
            
            if isinstance(data, list):
                page_attendees = data
                # If we get less than limit, we're done
                if len(page_attendees) < limit:
                    all_attendees.extend(page_attendees)
                    break
            elif isinstance(data, dict):
                if 'data' in data:
                    page_attendees = data['data']
                    meta = data.get('meta', {})
                elif 'people' in data:
                    page_attendees = data['people']
                elif 'attendees' in data:
                    page_attendees = data['attendees']
            
            if not page_attendees:
                break
                
            all_attendees.extend(page_attendees)
            
            # Check if we've fetched all items
            total_items = meta.get('pagination', {}).get('total_items_count', len(page_attendees))
            if len(all_attendees) >= total_items or len(page_attendees) < limit:
                break
                
            page += 1
        
        return all_attendees
    
    def get_checkins(self, event_id: str, session_id: Optional[str] = None) -> List[Dict]:
        """Fetch check-ins for an event or session by querying people with checkin_status filter"""
        # EventMobi API doesn't have a separate checkins endpoint
        # Instead, we query people with checkin_status filter
        params = {'checkin_status': 'checked_in'}
        if session_id:
            params['checkin_session_id'] = session_id
        
        # For event check-ins (not session-specific), we query without session_id
        # and filter out those with session check-ins
        data = self._make_request('GET', f'events/{event_id}/people', params=params)
        if isinstance(data, list):
            checkins = data
        elif isinstance(data, dict) and 'data' in data:
            checkins = data['data']
        elif isinstance(data, dict) and 'people' in data:
            checkins = data['people']
        elif isinstance(data, dict) and 'checkins' in data:
            checkins = data['checkins']
        else:
            return []
        
        # If no session_id specified, filter to only event check-ins (no session check-in)
        if not session_id:
            # Event check-ins are people checked in but NOT checked into a specific session
            event_only_checkins = [
                person for person in checkins
                if not person.get('checkin_session_id') and not person.get('session_checkin_id')
            ]
            return event_only_checkins
        
        return checkins
    
    def get_sessions(self, event_id: str) -> List[Dict]:
        """Fetch sessions for an event with settings and location included"""
        # Include settings and location - capacity_limit may be in settings or location
        # Note: capacity_limit is sortable but may not be returned in response
        params = {'include': 'settings,location'}
        data = self._make_request('GET', f'events/{event_id}/sessions', params=params)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and 'data' in data:
            return data['data']
        elif isinstance(data, dict) and 'sessions' in data:
            return data['sessions']
        return []
    
    def get_active_sessions(self, event_id: str) -> List[Dict]:
        """Get sessions that are still on, starting within 30 minutes, or ended in the last 30 minutes (always up to 15 total, filled with last ended sessions if needed), with check-in counts"""
        from datetime import datetime, timedelta, timezone
        
        try:
            # Get all sessions
            all_sessions = self.get_sessions(event_id)
            
            # Calculate time range: now to 30 minutes from now, and past 30 minutes
            now = datetime.now(timezone.utc)
            future_cutoff = now + timedelta(minutes=30)
            past_cutoff = now - timedelta(minutes=30)
            
            # Filter sessions: prioritize active/upcoming, then include recently ended
            active_session_ids = []
            recently_ended_session_ids = []
            all_ended_session_ids = []  # Track all ended sessions for fallback
            sessions_by_id = {}
            
            for session in all_sessions:
                # Parse session start and end times
                start_str = session.get('start_datetime') or session.get('start_date_time')
                end_str = session.get('end_datetime') or session.get('end_date_time')
                
                if not start_str:
                    continue
                
                try:
                    # Parse ISO datetime
                    start_dt = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                    if start_dt.tzinfo is None:
                        start_dt = start_dt.replace(tzinfo=timezone.utc)
                    
                    end_dt = None
                    if end_str:
                        end_dt = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
                        if end_dt.tzinfo is None:
                            end_dt = end_dt.replace(tzinfo=timezone.utc)
                    
                    session_id = session.get('id') or session.get('session_id')
                    if not session_id:
                        continue
                    
                    sessions_by_id[session_id] = session
                    
                    # Check if session is happening now or starting soon
                    # Session is active if:
                    # 1. It's still on (has started and ends after now), OR
                    # 2. It starts within the next 30 minutes
                    is_active = False
                    is_recently_ended = False
                    is_ended = False
                    
                    if end_dt:
                        # Session is active if:
                        # - It has started (start_dt <= now) AND is still on (end_dt > now), OR
                        # - It starts within the next 30 minutes
                        is_active = (start_dt <= now < end_dt) or (now <= start_dt <= future_cutoff)
                        # Session is recently ended if it ended in the last 30 minutes
                        is_recently_ended = (end_dt <= now) and (end_dt >= past_cutoff)
                        # Track all ended sessions for fallback
                        is_ended = (end_dt <= now)
                    else:
                        # If no end time, check if it starts within next 30 minutes OR if it has started (started in the past)
                        is_active = (now <= start_dt <= future_cutoff) or (start_dt <= now)
                    
                    if is_active:
                        active_session_ids.append(session_id)
                    elif is_recently_ended:
                        recently_ended_session_ids.append(session_id)
                    elif is_ended and end_dt:
                        # Track all ended sessions with their end time for fallback
                        all_ended_session_ids.append((session_id, end_dt))
                except Exception as parse_err:
                    print(f"Error parsing session datetime: {parse_err}")
                    continue
            
            # Combine active and recently ended sessions, prioritizing active ones
            # Always try to show 15 sessions total
            all_session_ids = active_session_ids.copy()
            remaining_slots = 15 - len(all_session_ids)
            if remaining_slots > 0:
                all_session_ids.extend(recently_ended_session_ids[:remaining_slots])
            
            # If still not enough sessions, fill with last ended sessions (regardless of when they ended)
            remaining_slots = 15 - len(all_session_ids)
            if remaining_slots > 0 and len(all_ended_session_ids) > 0:
                # Sort all ended sessions by end time (most recent first)
                all_ended_session_ids.sort(key=lambda x: x[1], reverse=True)
                # Get session IDs that aren't already in our list
                available_ended_ids = [
                    sid for sid, _ in all_ended_session_ids 
                    if sid not in all_session_ids
                ]
                all_session_ids.extend(available_ended_ids[:remaining_slots])
            
            # Update to use all_session_ids instead of active_session_ids
            active_session_ids = all_session_ids
            
            # Batch fetch check-in counts for active sessions only
            # Count unique attendees (people) who checked in, not check-in records
            # Note: The API doesn't support filtering by session_id, so we still need to fetch all
            # but we can optimize by stopping early if we've counted all active sessions
            checkin_counts_by_session = {}  # Will store sets of unique person IDs per session
            try:
                checkin_page = 0
                checkin_limit = 1000
                
                # Track if we've found counts for all active sessions to potentially stop early
                # (Though API doesn't guarantee order, so we still need all pages)
                
                while True:
                    # Query session check-ins with person data to count unique attendees
                    checkin_params = {
                        'entity_type': 'sessions',
                        'page': checkin_page,
                        'limit': checkin_limit,
                        'include': 'person'  # Include person data to get person_id
                    }
                    checkins_data = self._make_request('GET', f'events/{event_id}/checkin', params=checkin_params)
                    
                    # Parse response
                    page_checkins = []
                    if isinstance(checkins_data, list):
                        page_checkins = checkins_data
                    elif isinstance(checkins_data, dict):
                        if 'data' in checkins_data:
                            page_checkins = checkins_data['data']
                        elif 'checkins' in checkins_data:
                            page_checkins = checkins_data['checkins']
                    
                    if not page_checkins:
                        break
                    
                    # Count unique attendees (people) per session
                    # For session pills, we show count of unique attendees who checked in
                    for checkin in page_checkins:
                        if isinstance(checkin, dict):
                            entity_id = checkin.get('entity_id')
                            if entity_id and entity_id in active_session_ids:
                                # Initialize set for this session if needed
                                if entity_id not in checkin_counts_by_session:
                                    checkin_counts_by_session[entity_id] = set()
                                
                                # Get person ID from checkin
                                person = checkin.get('person') or {}
                                person_id = person.get('id') or person.get('people_id') or checkin.get('person_id') or checkin.get('people_id')
                                
                                if person_id:
                                    # Add person ID to set (automatically handles uniqueness)
                                    checkin_counts_by_session[entity_id].add(str(person_id))
                    
                    # Check if we've fetched all items
                    if isinstance(checkins_data, dict):
                        meta = checkins_data.get('meta', {})
                        total_items = meta.get('pagination', {}).get('total_items_count', 0)
                        if len(page_checkins) < checkin_limit:
                            break
                        # If we know total and have processed all, break
                        if total_items and (checkin_page + 1) * checkin_limit >= total_items:
                            break
                    elif len(page_checkins) < checkin_limit:
                        break
                    
                    checkin_page += 1
            except Exception as checkin_err:
                print(f"Error fetching session check-in counts: {checkin_err}")
            
            # Build active sessions list with check-in counts
            active_sessions = []
            for session_id in active_session_ids:
                session = sessions_by_id[session_id]
                start_str = session.get('start_datetime') or session.get('start_date_time')
                end_str = session.get('end_datetime') or session.get('end_date_time')
                
                # Get unique attendee count from batch fetch (convert set to count)
                attendee_set = checkin_counts_by_session.get(session_id, set())
                if isinstance(attendee_set, set):
                    checkin_count = len(attendee_set)
                else:
                    # Fallback: if it's not a set (shouldn't happen), default to 0
                    checkin_count = 0
                
                # Get capacity - capacity_limit is sortable but not returned in API response
                # If capacity becomes available in the future, it would be here
                capacity = None
                if session.get('capacity_limit'):
                    capacity = session.get('capacity_limit')
                elif session.get('capacity'):
                    capacity = session.get('capacity')
                
                # Extract location - can be an object with 'label' or a string
                location_obj = session.get('location')
                location_name = None
                if location_obj:
                    if isinstance(location_obj, dict):
                        location_name = location_obj.get('label') or location_obj.get('name')
                    elif isinstance(location_obj, str):
                        location_name = location_obj
                else:
                    location_name = session.get('venue') or session.get('venue_name')
                
                active_sessions.append({
                    'id': session_id,
                    'name': session.get('name') or session.get('title') or 'Unnamed Session',
                    'start_datetime': start_str,
                    'end_datetime': end_str,
                    'checkin_count': checkin_count,
                    'capacity': int(capacity) if capacity else None,
                    'location': location_name,
                })
            
            # Sort by start time (newest first, oldest at bottom)
            active_sessions.sort(key=lambda s: s.get('start_datetime', ''), reverse=True)
            
            return active_sessions
            
        except Exception as e:
            print(f"Error fetching active sessions: {e}")
            return []
    
    def register_webhook(self, event_id: str, webhook_url: str, webhook_type: str = 'checkins') -> Dict:
        """Register a webhook with EventMobi for an event"""
        # According to Swagger: WebhookPost only requires callback_url and type
        payload = {
            'callback_url': webhook_url,
            'type': webhook_type
        }
        
        try:
            # First, check if webhook already exists
            try:
                webhooks = self._make_request('GET', f'events/{event_id}/webhooks', params={'type': webhook_type})
                webhook_list = []
                if isinstance(webhooks, list):
                    webhook_list = webhooks
                elif isinstance(webhooks, dict):
                    webhook_list = webhooks.get('data', []) or webhooks.get('webhooks', [])
                
                print(f"Found {len(webhook_list)} existing webhook(s) of type '{webhook_type}'")
                
                # Priority 1: Find webhook with exact same URL (enable it if disabled)
                matching_webhook_id = None
                for webhook in webhook_list:
                    if webhook.get('type') == webhook_type:
                        existing_url = webhook.get('callback_url')
                        if existing_url == webhook_url:
                            webhook_id = webhook.get('id') or webhook.get('webhook_id')
                            if webhook_id:
                                matching_webhook_id = webhook_id
                                print(f"Found webhook {webhook_id} with matching URL. Enabling and updating...")
                                # Update existing webhook using PATCH - ensure enabled and URL matches
                                update_payload = {**payload, 'enabled': True}
                                try:
                                    result = self._make_request('PATCH', f'events/{event_id}/webhooks/{webhook_id}', json=update_payload)
                                    print(f"Webhook updated successfully: {result}")
                                    # Verify the webhook is enabled
                                    if isinstance(result, dict):
                                        webhook_data = result.get('data', result)
                                        if isinstance(webhook_data, dict):
                                            enabled = webhook_data.get('enabled', True)
                                            callback_url = webhook_data.get('callback_url')
                                            print(f"Webhook enabled status: {enabled}, URL: {callback_url}")
                                    return result
                                except Exception as patch_err:
                                    print(f"PATCH failed, trying PUT: {patch_err}")
                                    try:
                                        update_payload_put = {**payload, 'enabled': True}
                                        result = self._make_request('PUT', f'events/{event_id}/webhooks/{webhook_id}', json=update_payload_put)
                                        print(f"Webhook updated successfully via PUT")
                                        return result
                                    except:
                                        raise patch_err
                
                # Priority 2: If no exact match, disable old webhooks and update/create with new URL
                # First, disable all other webhooks of this type (to avoid conflicts)
                for webhook in webhook_list:
                    if webhook.get('type') == webhook_type:
                        webhook_id = webhook.get('id') or webhook.get('webhook_id')
                        if webhook_id and webhook_id != matching_webhook_id:
                            existing_url = webhook.get('callback_url')
                            if existing_url != webhook_url:
                                print(f"Disabling old webhook {webhook_id} with URL {existing_url}")
                                try:
                                    disable_payload = {'enabled': False}
                                    self._make_request('PATCH', f'events/{event_id}/webhooks/{webhook_id}', json=disable_payload)
                                except:
                                    pass  # Ignore errors when disabling old webhooks
                
                # Priority 3: If we found a matching webhook but couldn't update it, or if no match exists,
                # try updating the first webhook. If provider refuses to update URL, delete and recreate.
                if not matching_webhook_id:
                    for webhook in webhook_list:
                        if webhook.get('type') == webhook_type:
                            webhook_id = webhook.get('id') or webhook.get('webhook_id')
                            if webhook_id:
                                print(f"Updating existing webhook {webhook_id} with URL {webhook_url}")
                                # Update existing webhook using PATCH - also update enabled status and URL
                                update_payload = {**payload, 'enabled': True}
                                try:
                                    result = self._make_request('PATCH', f'events/{event_id}/webhooks/{webhook_id}', json=update_payload)
                                    print(f"Webhook updated successfully: {result}")
                                    # Verify the webhook is enabled
                                    if isinstance(result, dict):
                                        webhook_data = result.get('data', result)
                                        if isinstance(webhook_data, dict):
                                            enabled = webhook_data.get('enabled', True)
                                            callback_url = webhook_data.get('callback_url')
                                            print(f"Webhook enabled status: {enabled}, URL: {callback_url}")
                                            # If URL didn't update, delete and recreate
                                            if callback_url != webhook_url:
                                                print(f"WARNING: Webhook URL didn't update (got {callback_url}, expected {webhook_url}). Deleting and recreating...")
                                                try:
                                                    self._make_request('DELETE', f'events/{event_id}/webhooks/{webhook_id}')
                                                except Exception as del_err:
                                                    print(f"Failed to delete webhook {webhook_id}: {del_err}")
                                                # Create new
                                                created = self._make_request('POST', f'events/{event_id}/webhooks', json=payload)
                                                print(f"Webhook re-created: {created}")
                                                return created
                                    return result
                                except Exception as patch_err:
                                    # If PATCH fails, try PUT
                                    print(f"PATCH failed, trying PUT: {patch_err}")
                                    try:
                                        update_payload_put = {**payload, 'enabled': True}
                                        result = self._make_request('PUT', f'events/{event_id}/webhooks/{webhook_id}', json=update_payload_put)
                                        print(f"Webhook updated successfully via PUT")
                                        # Verify URL and fallback to delete+create if mismatch
                                        if isinstance(result, dict):
                                            webhook_data = result.get('data', result)
                                            if isinstance(webhook_data, dict):
                                                callback_url = webhook_data.get('callback_url')
                                                if callback_url != webhook_url:
                                                    print(f"PUT updated webhook but URL still mismatched (got {callback_url}). Deleting and recreating...")
                                                    try:
                                                        self._make_request('DELETE', f'events/{event_id}/webhooks/{webhook_id}')
                                                    except Exception as del_err:
                                                        print(f"Failed to delete webhook {webhook_id}: {del_err}")
                                                    created = self._make_request('POST', f'events/{event_id}/webhooks', json=payload)
                                                    print(f"Webhook re-created: {created}")
                                                    return created
                                        return result
                                    except:
                                        raise patch_err
                                break  # Only update the first one
            except Exception as list_err:
                # If we can't list webhooks, try to create anyway
                print(f"Could not list existing webhooks: {list_err}")
                pass
            
            # Try to create new webhook
            print(f"Creating new webhook with URL {webhook_url}")
            result = self._make_request('POST', f'events/{event_id}/webhooks', json=payload)
            print(f"Webhook created successfully: {result}")
            
            # Verify the webhook was created and enabled
            if isinstance(result, dict):
                webhook_data = result.get('data', result)
                if isinstance(webhook_data, dict):
                    webhook_id = webhook_data.get('id')
                    enabled = webhook_data.get('enabled', True)
                    print(f"Webhook ID: {webhook_id}, Enabled: {enabled}, URL: {webhook_data.get('callback_url')}")
                    
            return result
        except Exception as e:
            # Re-raise with more context
            error_msg = str(e)
            if 'already exists' in error_msg.lower() or 'duplicate' in error_msg.lower():
                # Webhook might already exist, try to update it anyway
                try:
                    webhooks = self._make_request('GET', f'events/{event_id}/webhooks')
                    webhook_list = []
                    if isinstance(webhooks, list):
                        webhook_list = webhooks
                    elif isinstance(webhooks, dict):
                        webhook_list = webhooks.get('data', []) or webhooks.get('webhooks', [])
                    
                    for webhook in webhook_list:
                        if webhook.get('type') == webhook_type:
                            webhook_id = webhook.get('id') or webhook.get('webhook_id')
                            if webhook_id:
                                return self._make_request('PATCH', f'events/{event_id}/webhooks/{webhook_id}', json=payload)
                except:
                    pass
            
            raise Exception(f"Failed to register webhook: {error_msg}")
    
    def get_event_stats(self, event_id: str) -> Dict:
        """Get statistics for an event (attendees, check-ins)
        Efficiently gets totals with pagination support.
        Optimized to avoid duplicate full fetches when get_active_sessions is also called.
        """
        try:
            # Get total attendees count from metadata instead of paginating through all attendees
            # The people endpoint provides the total count in meta.pagination.total_items_count
            # This is much faster - we only need 1 API call with limit=1 instead of 3+ pages
            total_attendees = 0
            try:
                attendees_params = {'page': 0, 'limit': 1}
                attendees_data = self._make_request('GET', f'events/{event_id}/people', params=attendees_params)
                
                # Extract total count from metadata
                if isinstance(attendees_data, dict):
                    meta = attendees_data.get('meta', {})
                    pagination = meta.get('pagination', {})
                    total_attendees = pagination.get('total_items_count', 0)
            except Exception as attendees_err:
                print(f"Could not get total attendees from metadata: {attendees_err}")
                # Fallback: fetch all attendees if metadata not available
                all_attendees = self.get_attendees(event_id)
                total_attendees = len(all_attendees)
            
            # Count check-ins directly from the checkin endpoint (more efficient than people endpoint)
            # This avoids the need to fetch all checked-in people separately
            session_checkins_count = 0
            event_checkins_count = 0
            
            try:
                # Use metadata total_items_count instead of paginating through all records
                # The checkin endpoint provides the total count in meta.pagination.total_items_count
                # This is much faster - we only need to make 2 API calls instead of potentially dozens
                
                # Get session check-ins total count from metadata (limit=1 to minimize data transfer)
                session_checkin_params = {
                    'entity_type': 'sessions',
                    'page': 0,
                    'limit': 1  # We only need the metadata, not the actual data
                }
                session_checkins_data = self._make_request('GET', f'events/{event_id}/checkin', params=session_checkin_params)
                
                # Extract total count from metadata
                if isinstance(session_checkins_data, dict):
                    meta = session_checkins_data.get('meta', {})
                    pagination = meta.get('pagination', {})
                    session_checkins_count = pagination.get('total_items_count', 0)
                else:
                    # Fallback: if metadata not available, count manually (shouldn't happen)
                    session_checkins_count = 0
                
                # Get event check-ins total count from metadata (limit=1 to minimize data transfer)
                event_checkin_params = {
                    'entity_type': 'events',
                    'page': 0,
                    'limit': 1  # We only need the metadata, not the actual data
                }
                event_checkins_data = self._make_request('GET', f'events/{event_id}/checkin', params=event_checkin_params)
                
                # Extract total count from metadata
                if isinstance(event_checkins_data, dict):
                    meta = event_checkins_data.get('meta', {})
                    pagination = meta.get('pagination', {})
                    event_checkins_count = pagination.get('total_items_count', 0)
                else:
                    # Fallback: if metadata not available, count manually (shouldn't happen)
                    event_checkins_count = 0
                
            except Exception as checkin_err:
                print(f"Could not count check-ins via checkin endpoint: {checkin_err}")
                # Fallback: count from people objects (less efficient but works)
                all_checkins = []
                page = 0
                limit = 1000
                
                while True:
                    params = {'checkin_status': 'checked_in', 'page': page, 'limit': limit, 'include': 'checkins'}
                    checkins_data = self._make_request('GET', f'events/{event_id}/people', params=params)
                    
                    page_checkins = []
                    meta = {}
                    
                    if isinstance(checkins_data, list):
                        page_checkins = checkins_data
                        if len(page_checkins) < limit:
                            all_checkins.extend(page_checkins)
                            break
                    elif isinstance(checkins_data, dict):
                        if 'data' in checkins_data:
                            page_checkins = checkins_data['data']
                            meta = checkins_data.get('meta', {})
                        elif 'people' in checkins_data:
                            page_checkins = checkins_data['people']
                    
                    if not page_checkins:
                        break
                        
                    all_checkins.extend(page_checkins)
                    
                    total_items = meta.get('pagination', {}).get('total_items_count', len(page_checkins))
                    if len(all_checkins) >= total_items or len(page_checkins) < limit:
                        break
                        
                    page += 1
                
                # Count from people objects
                event_checkins_list = []
                session_checkins_set = set()
                
                for person in all_checkins:
                    person_id = person.get('id') or person.get('people_id')
                    person_checkins = person.get('checkins', [])
                    
                    has_session_checkin = False
                    if person_checkins:
                        for checkin in person_checkins:
                            if isinstance(checkin, dict):
                                entity_type = checkin.get('entity_type')
                                if entity_type == 'sessions':
                                    has_session_checkin = True
                                    break
                    
                    if not has_session_checkin and not person_checkins:
                        has_session_checkin = (
                            person.get('checkin_session_id') or 
                            person.get('session_checkin_id') or
                            person.get('session_checkin_ids')
                        )
                    
                    if has_session_checkin:
                        if person_id:
                            session_checkins_set.add(person_id)
                    else:
                        event_checkins_list.append(person)
                
                session_checkins_count = len(session_checkins_set)
                event_checkins_count = len(event_checkins_list)
            
            return {
                'total_attendees': total_attendees,
                'event_checkins': event_checkins_count,
                'session_checkins': session_checkins_count
            }
        except Exception as e:
            raise Exception(f"Failed to fetch event stats: {e}")
    

