"""connpass ユーザー参加イベント API から参加済みイベント ID を取得し JSON に書き出す。

エンドポイント: https://connpass.com/api/v2/users/{username}/events/
出力先: site/data/applied_ids.json
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API_BASE = "https://connpass.com/api/v2/users/{username}/events/"
JST = timezone(timedelta(hours=9))


def fetch_applied_ids(username: str, api_key: str | None) -> list[int]:
    """ユーザーの参加済みイベント ID をページネーションしながら全件取得する。

    - 100 件単位で取得し、全ページ消化するまでループ。
    - リクエスト間は 1 秒スリープ（レート制限対策）。
    - api_key が None / 空文字列の場合は X-API-Key ヘッダーを付与しない。
    """
    url = API_BASE.format(username=username)
    headers: dict[str, str] = {}
    if api_key:
        headers["X-API-Key"] = api_key

    all_ids: list[int] = []
    start = 1

    while True:
        params = {"count": 100, "start": start}
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        payload = response.json()

        events = payload.get("events", [])
        all_ids.extend(event["id"] for event in events)

        results_returned = payload.get("results_returned", len(events))
        results_available = payload.get("results_available", 0)

        if results_returned == 0 or start + results_returned > results_available:
            break
        start += results_returned
        time.sleep(1)

    return all_ids


def save_applied_ids(applied_ids: list[int], path: Path) -> None:
    """applied_ids.json を書き出す。updated_at は JST の ISO 形式。"""
    payload = {
        "updated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "applied_ids": applied_ids,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent

    # config.json から connpass_username を読み込む（フィールドが存在しない場合は空文字列）
    config_path = project_root / "config.json"
    config: dict = {}
    if config_path.exists():
        config = json.loads(config_path.read_text(encoding="utf-8"))

    # 環境変数 CONNPASS_USERNAME が最優先、なければ config.json の値
    username = os.environ.get("CONNPASS_USERNAME") or config.get("connpass_username", "")

    output_path = project_root / "site" / "data" / "applied_ids.json"

    if not username:
        print("connpass_username が未設定のため、空の applied_ids.json を書き出してスキップします。")
        save_applied_ids([], output_path)
        print(f"Wrote {output_path}")
        return 0

    api_key = os.environ.get("CONNPASS_API_KEY", "")

    if not api_key:
        print("WARNING: CONNPASS_API_KEY が未設定です。APIキーなしで試みます。", file=sys.stderr)

    print(f"Fetching applied events for user: {username}")
    applied_ids = fetch_applied_ids(username, api_key)
    print(f"Fetched {len(applied_ids)} applied event IDs")

    save_applied_ids(applied_ids, output_path)
    print(f"Wrote {output_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
