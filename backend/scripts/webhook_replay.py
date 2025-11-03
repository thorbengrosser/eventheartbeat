#!/usr/bin/env python3
import argparse
import json
import time
from datetime import datetime, timezone
from typing import List, Dict, Any
import random
from urllib import request, error
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED


def parse_iso(dt: str) -> datetime:
    # Accept ISO8601 with timezone; fallback to naive as UTC
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    except Exception:
        return datetime.strptime(dt, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def post_json(url: str, payload: Dict[str, Any], timeout: float = 10.0) -> int:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            _ = resp.read()
            return getattr(resp, "status", 200)
    except error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def load_events(path: str) -> List[Dict[str, Any]]:
    """Load webhook payloads from a JSONL (one JSON object per line) or a JSON array file."""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read().strip()
        if not text:
            return []
        # Try JSON array first
        if text[0] == "[":
            arr = json.loads(text)
            return [e for e in arr if isinstance(e, dict)]
        # Otherwise treat as JSONL
        events = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    events.append(obj)
            except Exception:
                continue
        return events


def sort_by_change_datetime(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def key(e: Dict[str, Any]):
        dt = e.get("change_datetime")
        try:
            return parse_iso(dt) if dt else datetime.fromtimestamp(0, tz=timezone.utc)
        except Exception:
            return datetime.fromtimestamp(0, tz=timezone.utc)
    return sorted(events, key=key)


def replay(
    url: str,
    events: List[Dict[str, Any]],
    speed: float,
    min_gap: float,
    max_gap: float,
    first_gap_max: float = 5.0,
    jitter: float = 0.3,
    burst_prob: float = 0.2,
    max_burst: int = 3,
    burst_gap: float = 0.05,
    concurrency: int = 1,
    randomize_concurrency: bool = False,
) -> None:
    if not events:
        print("No events to replay")
        return

    events = sort_by_change_datetime(events)

    def submit_request(ev: Dict[str, Any], pending_futures: set, executor: ThreadPoolExecutor, max_in_flight: int) -> set:
        fut = executor.submit(post_json, url, ev)
        pending_futures.add(fut)
        # Backpressure to keep in-flight requests under the concurrency limit
        while len(pending_futures) >= max(1, max_in_flight):
            done, not_done = wait(pending_futures, return_when=FIRST_COMPLETED)
            pending_futures = not_done
            break
        return pending_futures

    # Compute original gaps from change_datetime; fall back to min_gap if missing
    last_dt = None
    sent = 0
    first_sleep_applied = False
    i = 0
    n = len(events)
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as executor:
        pending = set()
        while i < n:
            ev = events[i]
            dt_str = ev.get("change_datetime")
            dt = None
            try:
                dt = parse_iso(dt_str) if dt_str else None
            except Exception:
                dt = None

            # Sleep according to original delta scaled by speed, with jitter and optional first cap
            if last_dt and dt:
                delta = (dt - last_dt).total_seconds()
                sleep_for = max(min_gap, min(max_gap, max(0.0, delta / max(speed, 1e-6))))
                # Apply jitter +/- jitter%
                if jitter > 0:
                    factor = random.uniform(max(0.0, 1 - jitter), 1 + jitter)
                    sleep_for *= factor
                    sleep_for = max(min_gap, min(max_gap, sleep_for))
                if not first_sleep_applied:
                    sleep_for = min(sleep_for, first_gap_max)
                    first_sleep_applied = True
                time.sleep(sleep_for)
            elif sent > 0:
                time.sleep(min_gap)

            # Submit current event without blocking
            effective_limit = concurrency
            if randomize_concurrency:
                # Randomize the in-flight cap between 1 and the configured concurrency
                effective_limit = max(1, random.randint(1, max(1, concurrency)))
            pending = submit_request(ev, pending, executor, effective_limit)
            sent += 1
            last_dt = dt or last_dt
            i += 1

            # Occasionally send a burst of additional events close together
            if i < n and burst_prob > 0 and random.random() < burst_prob:
                burst_count = random.randint(1, max(1, max_burst - 1))
                for _k in range(burst_count):
                    if i >= n:
                        break
                    time.sleep(burst_gap)
                    ev_b = events[i]
                    effective_limit_burst = concurrency
                    if randomize_concurrency:
                        effective_limit_burst = max(1, random.randint(1, max(1, concurrency)))
                    pending = submit_request(ev_b, pending, executor, effective_limit_burst)
                    sent += 1
                    # Update last_dt with the nominal timestamp to keep relative pacing reasonable
                    dtb_str = ev_b.get("change_datetime")
                    try:
                        dtb = parse_iso(dtb_str) if dtb_str else None
                    except Exception:
                        dtb = None
                    last_dt = dtb or last_dt
                    i += 1

        # Drain any outstanding requests before exiting
        if pending:
            wait(pending)

    print(f"Replayed {sent} event(s) to {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay captured EventMobi webhook payloads to a target URL")
    parser.add_argument("--url", required=True, help="Target webhook URL, e.g. https://abc.ngrok.app/webhook/eventmobi")
    parser.add_argument("--input", required=True, help="Path to JSONL (one JSON per line) or JSON array file of webhook payloads")
    parser.add_argument("--speed", type=float, default=4.0, help="Playback speed multiplier (>1 = faster). Default: 4.0")
    parser.add_argument("--min-gap", type=float, default=0.5, help="Minimum seconds to sleep between events. Default: 0.5")
    parser.add_argument("--max-gap", type=float, default=5.0, help="Maximum seconds to sleep between events. Default: 5.0")
    parser.add_argument("--first-gap-max", type=float, default=5.0, help="Maximum delay before the second event (keeps first action <=5s). Default: 5.0")
    parser.add_argument("--jitter", type=float, default=0.3, help="Jitter fraction applied to inter-event sleeps (e.g., 0.3 = ±30%). Default: 0.3")
    parser.add_argument("--burst-prob", type=float, default=0.2, help="Probability to send a short burst (multiple events close together). Default: 0.2")
    parser.add_argument("--max-burst", type=int, default=3, help="Maximum events to send in a burst (including the first already sent). Default: 3")
    parser.add_argument("--burst-gap", type=float, default=0.05, help="Gap (seconds) between events inside a burst. Default: 0.05")
    parser.add_argument("--concurrency", type=int, default=1, help="Max in-flight HTTP requests. Default: 1")
    parser.add_argument("--randomize-concurrency", action="store_true", help="Randomize in-flight limit between 1 and --concurrency to avoid steady fixed parallelism")

    args = parser.parse_args()

    events = load_events(args.input)
    replay(
        args.url,
        events,
        speed=args.speed,
        min_gap=args.min_gap,
        max_gap=args.max_gap,
        first_gap_max=args.first_gap_max,
        jitter=args.jitter,
        burst_prob=args.burst_prob,
        max_burst=args.max_burst,
        burst_gap=args.burst_gap,
        concurrency=args.concurrency,
        randomize_concurrency=args.randomize_concurrency,
    )


if __name__ == "__main__":
    main()


