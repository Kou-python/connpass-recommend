"""extract_trends のユニットテスト。

extract_trends は生イベントのリストと辞書を受け取り、
[{"term": str, "count": int}, ...] を出現数降順で返す純粋関数。
"""
import pytest


def make_event(title="", catch=""):
    return {"title": title, "catch": catch}


def test_counts_dictionary_term_in_title():
    from scripts.extract_trends import extract_trends
    events = [
        make_event(title="Claude Code Meetup"),
        make_event(title="Claude vs ChatGPT"),
        make_event(title="React deep dive"),
    ]
    result = extract_trends(events, dictionary=["Claude", "React"],
                            stopwords=set(), top_n=10)
    assert {"term": "Claude", "count": 2} in result
    assert {"term": "React", "count": 1} in result
