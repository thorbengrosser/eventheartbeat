#!/usr/bin/env python3
import argparse
import json
import random
import string
import time
from datetime import datetime, timezone
from urllib import request, error


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def random_id(prefix: str = "chk", length: int = 16) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return f"{prefix}_" + "".join(random.choice(alphabet) for _ in range(length))


def post_json(url: str, payload: dict, timeout: float = 10.0) -> int:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            # Drain response to avoid resource warnings
            _ = resp.read()
            return getattr(resp, "status", 200)
    except error.HTTPError as e:
        # Server returned an error; still return status for visibility
        return e.code
    except Exception:
        return 0


def simulate_checkins(url: str, event_id: str, duration_sec: int, min_interval: float, max_interval: float) -> None:
    """Send EventMobi-style 'checkins' webhooks for the specified duration.

    Payload shape (per EventMobi checkins webhook):
    {
      "operation": "create",
      "resource_ids": ["<checkin_id>"],
      "event_id": <event_id>,
      "type": "checkins",
      "change_datetime": "<ISO8601 UTC>"
    }

    The target server can parse this and optionally fetch the checkin details.
    """
    end_time = time.time() + duration_sec
    sent = 0
    while time.time() < end_time:
        payload = {
            "operation": "create",
            "resource_ids": [random_id()],
            "event_id": event_id,
            "type": "checkins",
            "change_datetime": iso_now(),
        }
        status = post_json(url, payload)
        sent += 1
        # Jittered interval between events
        sleep_for = random.uniform(min_interval, max_interval)
        # Ensure we don't oversleep past end_time too much
        if time.time() + sleep_for > end_time:
            remaining = max(0.0, end_time - time.time())
            time.sleep(remaining)
            break
        time.sleep(sleep_for)

    print(f"Sent {sent} webhook(s) to {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate EventMobi 'checkins' webhooks to a target URL")
    parser.add_argument("--url", required=True, help="Webhook endpoint URL (e.g., https://example.com/webhook/eventmobi)")
    parser.add_argument("--event-id", required=True, help="Event ID to include in payloads")
    parser.add_argument("--minutes", type=float, default=5.0, help="Duration to run in minutes (default: 5)")
    parser.add_argument("--min-interval", type=float, default=3.0, help="Minimum seconds between webhooks (default: 3.0)")
    parser.add_argument("--max-interval", type=float, default=9.0, help="Maximum seconds between webhooks (default: 9.0)")

    args = parser.parse_args()

    if args.min_interval <= 0 or args.max_interval <= 0 or args.max_interval < args.min_interval:
        raise SystemExit("Invalid interval settings: ensure 0 < min <= max")

    duration_sec = int(args.minutes * 60)
    simulate_checkins(
        url=args.url,
        event_id=str(args.event_id),
        duration_sec=duration_sec,
        min_interval=args.min_interval,
        max_interval=args.max_interval,
    )


if __name__ == "__main__":
    main()


