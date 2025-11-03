from typing import Dict, Optional


class WebhookHandler:
    """Handles incoming webhook events from EventMobi"""
    
    @staticmethod
    def parse_checkin_event(webhook_data: Dict) -> Optional[Dict]:
        """
        Parse webhook data and extract relevant information for check-in events.
        EventMobi sends 'checkins' webhooks with resource_ids (checkin IDs).
        Returns a dict with: resource_ids, operation, event_id, change_datetime
        """
        try:
            # EventMobi webhook structure for checkins:
            # {
            #   "operation": "create" (for check-in) or "delete" (for checkout),
            #   "resource_ids": ["checkin_id1", "checkin_id2"],
            #   "event_id": 123,
            #   "type": "checkins",
            #   "change_datetime": "..."
            # }
            
            webhook_type = webhook_data.get('type') or webhook_data.get('event_type')
            operation = webhook_data.get('operation') or webhook_data.get('action')
            
            # Only process 'checkins' type webhooks
            if webhook_type != 'checkins':
                return None
            
            # Extract resource IDs (checkin IDs)
            resource_ids = webhook_data.get('resource_ids', [])
            if not resource_ids:
                return None
            
            # Only process 'create' operations (actual check-ins, not checkouts)
            if operation != 'create':
                return None
            
            return {
                'resource_ids': resource_ids,
                'operation': operation,
                'event_id': webhook_data.get('event_id'),
                'change_datetime': webhook_data.get('change_datetime'),
                'webhook_type': webhook_type,
                'raw_data': webhook_data
            }
            
        except Exception as e:
            print(f"Error parsing webhook data: {e}")
            return None
    
    @staticmethod
    def format_bubble_message(parsed_data: Dict) -> str:
        """Format parsed webhook data into a bubble message"""
        attendee_name = parsed_data.get('attendee_name', 'Someone')
        checkin_type = parsed_data.get('checkin_type', 'event')
        location_name = parsed_data.get('location_name', 'the event')
        
        if checkin_type == 'session':
            return f"{attendee_name} just checked into session \"{location_name}\""
        else:
            return f"{attendee_name} just checked into your event"
    
    @staticmethod
    def process_webhook(webhook_data: Dict) -> Optional[Dict]:
        """
        Process incoming webhook and return formatted data for broadcasting.
        For 'people' webhooks, we need to fetch person data to check if it's a check-in.
        """
        parsed = WebhookHandler.parse_checkin_event(webhook_data)
        if not parsed:
            return None
        
        # If we got basic webhook info, we need to fetch person data
        # For now, we'll return a simplified message that indicates a person change
        # In production, you'd fetch person data here via API to get check-in status
        
        # Extract what we can from the webhook
        resource_ids = parsed.get('resource_ids', [])
        operation = parsed.get('operation', 'update')
        
        # For now, treat people updates as potential check-ins
        # We'd need the API client to fetch person details
        # For now, return a generic message
        attendee_name = f"Person {resource_ids[0][:8]}..." if resource_ids else "Someone"
        
        return {
            'message': f"{attendee_name} just checked in",
            'attendee_name': attendee_name,
            'checkin_type': 'event',  # Default to event, could be session
            'location_name': 'the event',
            'timestamp': parsed.get('change_datetime'),
            'resource_ids': resource_ids,
            'needs_fetch': True  # Flag indicating we need to fetch person data
        }

