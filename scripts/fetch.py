"""connpass API からイベントを取得し、フィルタして JSON に書き出す。

3つの責務に分離:
- fetch_events: API IO（Task 5 で実装予定）
- filter_events: 純粋関数のフィルタ・ソート（あなたが実装する箇所）
- save_events: JSON 書き出し（Task 5 で実装予定）
"""
from __future__ import annotations


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
            "order_url": str,                # 申込画面の直リンク
                                              # 形式: f"https://connpass.com/event/{id}/order/"
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
        filtered.append({
            "event_id": event_id,
            "title": event.get("title", ""),
            "started_at": event.get("started_at", ""),
            "place": event.get("place", ""),
            "accepted": event.get("accepted", 0),
            "limit": event.get("limit"),
            "matched_keywords": matched_keywords,
            "matched_categories": matched_categories,
            "url": event.get("url", f"https://connpass.com/event/{event_id}/"),
            "order_url": f"https://connpass.com/event/{event_id}/order/",
        })

    filtered.sort(key=lambda e: e["accepted"], reverse=True)
    return filtered
