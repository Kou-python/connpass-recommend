"""connpass ユーザーページをHTMLスクレイピングして参加済みイベント ID を取得し JSON に書き出す。

スクレイピング対象: https://connpass.com/user/{username}/?page=N
出力先: site/data/applied_ids.json

APIキー不要。ページネーションの終端判定は「前ページと抽出したIDセットが完全一致したら終了」。
（範囲外ページは最終ページにクランプされHTTP 200を返すため、件数0での終端判定は使えない。）
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

USER_PAGE_URL = "https://connpass.com/user/{username}/"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
MAX_PAGES = 50
JST = timezone(timedelta(hours=9))

EVENT_ID_PATTERN = re.compile(r'/event/(\d+)/')


def extract_event_ids(html: str) -> list[int]:
    """HTML文字列から /event/{id}/ 形式のイベントIDを抽出する（重複排除・出現順保持）。"""
    seen: set[int] = set()
    ids: list[int] = []
    for m in EVENT_ID_PATTERN.finditer(html):
        eid = int(m.group(1))
        if eid not in seen:
            seen.add(eid)
            ids.append(eid)
    return ids


def fetch_applied_ids(username: str) -> list[int]:
    """ユーザーページをスクレイピングして参加イベントIDを全件取得する。

    範囲外ページは最終ページにクランプされるため、
    前ページとIDセットが一致したら終端とみなす。
    リクエスト間は1秒スリープ（レート制限対策）。
    """
    url = USER_PAGE_URL.format(username=username)
    headers = {"User-Agent": USER_AGENT}
    all_ids: list[int] = []
    seen_ids: set[int] = set()
    prev_page_ids: list[int] = []

    for page in range(1, MAX_PAGES + 1):
        params = {"page": page}
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        page_ids = extract_event_ids(response.text)

        # 終端判定: 空 or 前ページと完全一致（クランプ検出）
        if not page_ids or page_ids == prev_page_ids:
            break

        for eid in page_ids:
            if eid not in seen_ids:
                seen_ids.add(eid)
                all_ids.append(eid)

        prev_page_ids = page_ids
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

    print(f"Fetching applied events for user: {username}")
    applied_ids = fetch_applied_ids(username)
    print(f"Fetched {len(applied_ids)} applied event IDs")

    save_applied_ids(applied_ids, output_path)
    print(f"Wrote {output_path}")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
