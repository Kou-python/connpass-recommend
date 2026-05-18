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


def test_same_event_counts_term_only_once():
    from scripts.extract_trends import extract_trends
    events = [make_event(title="Claude Claude Claude", catch="Claude rocks")]
    result = extract_trends(events, dictionary=["Claude"],
                            stopwords=set(), top_n=10)
    assert result == [{"term": "Claude", "count": 1}]


def test_stopwords_are_excluded():
    from scripts.extract_trends import extract_trends
    events = [make_event(title="勉強会 about Claude")]
    result = extract_trends(events, dictionary=["勉強会", "Claude"],
                            stopwords={"勉強会"}, top_n=10)
    terms = [r["term"] for r in result]
    assert "勉強会" not in terms
    assert "Claude" in terms


def test_case_insensitive_match():
    from scripts.extract_trends import extract_trends
    events = [
        make_event(title="claude is great"),
        make_event(title="CLAUDE Meetup"),
        make_event(title="ClAuDe deep dive"),
    ]
    result = extract_trends(events, dictionary=["Claude"],
                            stopwords=set(), top_n=10)
    assert result == [{"term": "Claude", "count": 3}]


def test_returns_top_n_sorted_descending():
    from scripts.extract_trends import extract_trends
    events = [
        make_event(title="A B C D"),
        make_event(title="A B C"),
        make_event(title="A B"),
        make_event(title="A"),
    ]
    result = extract_trends(events, dictionary=["A", "B", "C", "D"],
                            stopwords=set(), top_n=2)
    assert result == [
        {"term": "A", "count": 4},
        {"term": "B", "count": 3},
    ]
