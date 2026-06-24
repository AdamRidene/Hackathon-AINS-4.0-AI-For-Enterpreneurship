"""KB URL health checker.

Pings every unique resource URL in the knowledge base and reports
accessibility status. Intended to be run weekly (cron / scheduled task).

Usage:
    python backend/scripts/kb_health.py
    python backend/scripts/kb_health.py --timeout 10  --report stale
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_KB_PATH = Path(__file__).resolve().parent.parent / "app" / "rag" / "data" / "kb.json"

DEFAULT_TIMEOUT = 15


def check_url(url: str, timeout: int) -> dict:
    """Ping *url* with a HEAD request and return status info."""
    result = {"url": url, "status": "unknown", "code": None, "error": None, "elapsed": None}
    start = time.time()
    try:
        req = urllib.request.Request(url, method="HEAD")
        # Add a common User-Agent to avoid being blocked
        req.add_header("User-Agent", "FirasaKBHealth/1.0")
        resp = urllib.request.urlopen(req, timeout=timeout)
        result["status"] = "ok"
        result["code"] = resp.getcode()
        result["elapsed"] = round(time.time() - start, 2)
    except urllib.error.HTTPError as e:
        code = e.getcode()
        if code and 300 <= code < 400:
            result["status"] = "redirect"
        elif code and 400 <= code < 500:
            result["status"] = "client_error"
        elif code and 500 <= code < 600:
            result["status"] = "server_error"
        else:
            result["status"] = "http_error"
        result["code"] = code
        result["error"] = str(e)
        result["elapsed"] = round(time.time() - start, 2)
    except urllib.error.URLError as e:
        result["status"] = "dns_or_connection_error"
        result["error"] = str(e.reason)
        result["elapsed"] = round(time.time() - start, 2)
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        result["elapsed"] = round(time.time() - start, 2)
    return result


def load_kb_urls(path: Path) -> list[dict]:
    """Load kb.json and return all unique resource URLs with metadata."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    seen: set[str] = set()
    entries: list[dict] = []
    for r in raw.get("resources", []):
        url = r.get("url", "").strip()
        if url and url not in seen:
            seen.add(url)
            entries.append({
                "id": r.get("id", ""),
                "url": url,
                "title": r.get("title", "")[:80],
                "institution": r.get("institution", ""),
            })
    return entries


def print_report(results: list[dict], entries: list[dict], verbose: bool = False) -> None:
    """Print a human-readable summary."""
    url_map = {e["url"]: e for e in entries}
    ok_count = sum(1 for r in results if r["status"] == "ok")
    fail_count = len(results) - ok_count

    print(f"{'=' * 60}")
    print(f"KB Health Check Report")
    print(f"{'=' * 60}")
    print(f"Total URLs checked : {len(results)}")
    print(f"OK                : {ok_count}")
    print(f"Issues            : {fail_count}")
    print()

    if verbose:
        for r in results:
            meta = url_map.get(r["url"], {})
            label = f"[{meta.get('id','?')}] {meta.get('institution','?')} — {meta.get('title','?')}"
            if r["status"] == "ok":
                print(f"  ✓ {r['code']}  {r['elapsed']:>5.1f}s  {r['url']:60s}  {label[:40]}")
            else:
                print(f"  ✗ {r.get('code','???')}  {r.get('elapsed','?'):>5}  {r['url']:60s}  {label[:40]}")
                print(f"    └─ {r['status']}: {r.get('error', '')}")

    failures = [r for r in results if r["status"] != "ok"]
    if failures:
        print(f"\n{'─' * 60}")
        print(f"FAILURES ({len(failures)}):")
        print(f"{'─' * 60}")
        for r in failures:
            meta = url_map.get(r["url"], {})
            label = f"[{meta.get('id','?')}] {meta.get('institution','?')}"
            print(f"  [{r['status']:25s}] {r['url']}")
            print(f"  {' ' * 27} {label} — {r.get('error', '')}")

    print(f"\n{'=' * 60}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Check KB resource URL health")
    parser.add_argument("--kb-path", type=str, default=None, help="Path to kb.json")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Request timeout (seconds)")
    parser.add_argument("--report", choices=["all", "stale"], default="all",
                        help="'all' (default) or 'stale' — only show issues")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print per-URL status")
    args = parser.parse_args()

    kb_path = Path(args.kb_path) if args.kb_path else _KB_PATH
    if not kb_path.exists():
        print(f"Error: KB file not found at {kb_path}", file=sys.stderr)
        sys.exit(1)

    entries = load_kb_urls(kb_path)
    if not entries:
        print("No URLs found in KB.")
        sys.exit(0)

    results: list[dict] = []
    print(f"Checking {len(entries)} URLs (timeout={args.timeout}s) ...")
    for entry in entries:
        result = check_url(entry["url"], args.timeout)
        results.append(result)
        status_char = "✓" if result["status"] == "ok" else "✗"
        print(f"  {status_char}  {result.get('code','???')}  {result.get('elapsed',0):>5.1f}s  {result['url'][:70]}")

    print()
    if args.report == "stale":
        results = [r for r in results if r["status"] != "ok"]
        entries = [e for e in entries if any(r["url"] == e["url"] for r in results)]

    print_report(results, entries, verbose=args.verbose or args.report == "all")


if __name__ == "__main__":
    main()
