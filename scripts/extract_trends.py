"""トレンド語抽出: シンプル頻度カウント方式。

入力: connpass V2 API の生イベント list[dict]（filter 適用前）。
出力: [{"term": str, "count": int}, ...] を count 降順で top_n まで。

同一イベント内の同一語は1回のみカウント。大文字小文字無視。
"""
from __future__ import annotations


def extract_trends(
    events: list[dict],
    dictionary: list[str],
    stopwords: set[str],
    top_n: int,
) -> list[dict]:
    counter: dict[str, int] = {}
    for event in events:
        haystack = (
            (event.get("title") or "") + " " + (event.get("catch") or "")
        ).lower()
        seen: set[str] = set()
        for term in dictionary:
            if term in stopwords:
                continue
            if term.lower() in haystack and term not in seen:
                counter[term] = counter.get(term, 0) + 1
                seen.add(term)

    items = [{"term": t, "count": c} for t, c in counter.items()]
    items.sort(key=lambda x: (-x["count"], x["term"]))
    return items[:top_n]
