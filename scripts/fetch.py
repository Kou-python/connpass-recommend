"""connpass API からイベントを取得し、フィルタして JSON に書き出す。

3つの責務に分離:
- fetch_events: API IO（Task 5 で実装予定）
- filter_events: 純粋関数のフィルタ・ソート（あなたが実装する箇所）
- save_events: JSON 書き出し（Task 5 で実装予定）
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API_URL = "https://connpass.com/api/v2/events/"
JST = timezone(timedelta(hours=9))


def filter_events(events: list[dict], config: dict) -> list[dict]:
    """API レスポンスをフィルタ＆ソートし、フロント向けの形に整形する。

    フィルタ条件: accepted >= min_accepted かつ キーワード1つ以上にマッチ。
    ソート: accepted の降順。

    入力 (events の各要素) は connpass API V2 のイベント:
        {
            "id": int,
            "title": str,
            "catch": str,
            "description": str,
            "accepted": int,
            "limit": int | None,
            "started_at": str,
            "place": str,
            "url": str,
        }

    出力 (各要素) はフロント向け:
        {
            "event_id": int,
            "title": str,
            "started_at": str,
            "place": str,
            "accepted": int,
            "limit": int | None,
            "matched_keywords": list[str],   # マッチしたキーワード
            "matched_categories": list[str], # マッチしたカテゴリ名
            "url": str,
            "join_url": str,                 # 申込画面の直リンク
                                              # 形式: f"{event.url}join/"（末尾は必ず "/"）
        }

    config の構造:
        {
            "min_accepted": int,
            "keywords": list[str],
            "categories": dict[str, list[str]],  # カテゴリ名 -> キーワード
        }
    """
    keywords = config["keywords"]
    categories = config["categories"]
    min_accepted = config["min_accepted"]

    filtered = []
    for event in events:
        if event.get("accepted", 0) < min_accepted:
            continue

        haystack = " ".join([
            event.get("title") or "",
            event.get("catch") or "",
            event.get("description") or "",
        ]).lower()

        matched_keywords = [k for k in keywords if k.lower() in haystack]
        if not matched_keywords:
            continue

        matched_categories = [
            cat for cat, cat_keywords in categories.items()
            if any(k.lower() in haystack for k in cat_keywords)
        ]

        event_id = event["id"]
        event_url = event.get("url") or f"https://connpass.com/event/{event_id}/"
        if not event_url.endswith("/"):
            event_url += "/"
        filtered.append({
            "event_id": event_id,
            "title": event.get("title", ""),
            "started_at": event.get("started_at", ""),
            "place": event.get("place", ""),
            "accepted": event.get("accepted", 0),
            "limit": event.get("limit"),
            "matched_keywords": matched_keywords,
            "matched_categories": matched_categories,
            "url": event_url,
            "join_url": f"{event_url}join/",
            "image_url": event.get("image_url") or "",
        })

    filtered.sort(key=lambda e: e["accepted"], reverse=True)
    return filtered


def fetch_events(api_key: str, days: int) -> list[dict]:
    """今後 days 日分のイベントを connpass API から取得する。

    ymd パラメータを日付ごとに指定して取得し、重複を排除する。
    レート制限対策として各リクエスト間に 1 秒スリープする。
    """
    today = datetime.now(JST).date()
    all_events: dict[int, dict] = {}

    for offset in range(days):
        target_date = today + timedelta(days=offset)
        ymd = target_date.strftime("%Y%m%d")
        start = 1
        while True:
            params = {"ymd": ymd, "count": 100, "start": start}
            response = requests.get(
                API_URL,
                params=params,
                headers={"X-API-Key": api_key},
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            events = payload.get("events", [])
            for event in events:
                all_events[event["id"]] = event

            results_returned = payload.get("results_returned", len(events))
            results_available = payload.get("results_available", 0)
            if start + results_returned > results_available or results_returned == 0:
                break
            start += results_returned
            time.sleep(1)
        time.sleep(1)

    return list(all_events.values())


def save_events(events: list[dict], path: Path) -> None:
    """events.json を書き出す。updated_at は JST の ISO 形式。"""
    payload = {
        "updated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "events": events,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    api_key = os.environ.get("CONNPASS_API_KEY")
    if not api_key:
        print("ERROR: CONNPASS_API_KEY is not set", file=sys.stderr)
        return 1

    project_root = Path(__file__).resolve().parent.parent
    config = json.loads((project_root / "config.json").read_text(encoding="utf-8"))
    output_path = project_root / "site" / "data" / "events.json"

    raw_events = fetch_events(api_key, config["fetch_days"])
    print(f"Fetched {len(raw_events)} events from API")

    filtered = filter_events(raw_events, config)
    print(f"After filtering: {len(filtered)} events")

    save_events(filtered, output_path)
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
