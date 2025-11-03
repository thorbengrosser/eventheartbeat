#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Dict, Any, Iterable, List
from urllib import request, parse, error


API_BASE = "https://uapi.eventmobi.com"


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def http_get_json(path: str, params: Dict[str, Any], api_key: str, timeout: float = 20.0) -> Any:
    qs = parse.urlencode(params, doseq=True)
    url = f"{API_BASE.rstrip('/')}/{path.lstrip('/')}"
    if qs:
        url = f"{url}?{qs}"
    req = request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {api_key}")
    # EventMobi requires a versioned Accept header
    req.add_header("Accept", "application/vnd.eventmobi+json; version=4")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            if not data:
                return None
            return json.loads(data.decode("utf-8"))
    except error.HTTPError as e:
        sys.stderr.write(f"HTTP {e.code} for {url}\n")
        data = e.read()
        if data:
            sys.stderr.write(data.decode("utf-8", errors="ignore") + "\n")
        raise


def iter_all_checkins(event_id: str, api_key: str, include_person: bool = False, page_size: int = 1000) -> Iterable[Dict[str, Any]]:
    """Yield all check-ins for both sessions and events entity types."""
    for entity_type in ("sessions", "events"):
        page = 0
        while True:
            params = {
                "entity_type": entity_type,
                "page": page,
                "limit": page_size,
            }
            if include_person:
                params["include"] = "person"
            data = http_get_json(f"events/{event_id}/checkin", params=params, api_key=api_key)

            # Response may be a list or an envelope { data: [...] } or { checkins: [...] }
            items: List[Dict[str, Any]] = []
            if isinstance(data, list):
                items = [x for x in data if isinstance(x, dict)]
            elif isinstance(data, dict):
                items = data.get("data") or data.get("checkins") or []
                if isinstance(items, dict):
                    items = [items]
                items = [x for x in items if isinstance(x, dict)]

            if not items:
                break

            for item in items:
                yield item

            # Stop if fewer than page_size returned
            if len(items) < page_size:
                break
            page += 1


def extract_change_datetime(checkin: Dict[str, Any]) -> str:
    # Try several plausible timestamp fields; fallback to now
    for key in (
        "change_datetime",
        "created_at",
        "created_datetime",
        "checkin_datetime",
        "updated_at",
        "timestamp",
    ):
        value = checkin.get(key)
        if isinstance(value, str) and value:
            return value
    return iso_now()


def to_webhook_payload(checkin: Dict[str, Any], event_id: str) -> Dict[str, Any]:
    chk_id = (
        checkin.get("id")
        or checkin.get("checkin_id")
        or checkin.get("resource_id")
        or ""
    )
    payload = {
        "operation": "create",
        "resource_ids": [chk_id] if chk_id else [],
        "event_id": event_id,
        "type": "checkins",
        "change_datetime": extract_change_datetime(checkin),
    }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch all EventMobi check-ins and write webhook-style payloads to a file")
    parser.add_argument("--api-key", required=True, help="EventMobi API key")
    parser.add_argument("--event-id", required=True, help="Event ID")
    parser.add_argument("--output", required=True, help="Output file path (.jsonl or .json)")
    parser.add_argument("--include-person", action="store_true", help="Include person data in the checkin fetch (slower)")
    parser.add_argument("--json", dest="as_json", action="store_true", help="Write a JSON array instead of JSONL")

    args = parser.parse_args()

    # Fetch
    checkins = list(iter_all_checkins(args.event_id, args.api_key, include_person=args.include_person))

    # Convert to webhook-style payloads
    events = [to_webhook_payload(c, args.event_id) for c in checkins]

    # Sort by change_datetime if present
    def sort_key(ev: Dict[str, Any]):
        return ev.get("change_datetime") or ""
    events.sort(key=sort_key)

    # Write
    if args.as_json or args.output.lower().endswith(".json"):
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            for ev in events:
                f.write(json.dumps(ev, ensure_ascii=False) + "\n")

    print(f"Wrote {len(events)} webhook event(s) to {args.output}")


if __name__ == "__main__":
    main()


