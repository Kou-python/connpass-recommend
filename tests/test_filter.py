"""filter_events のユニットテスト。

filter_events は connpass API のレスポンス（生イベントのリスト）と
config dict を受け取り、フィルタとソートを適用したリストを返す純粋関数。
"""
import pytest
from scripts.fetch import filter_events


def make_event(event_id=1, title="Test", catch="", description="",
               accepted=50, limit=100, started_at="2026-06-01T19:00:00+09:00",
               place="渋谷"):
    """テスト用にイベント dict を組み立てるヘルパー。"""
    return {
        "id": event_id,
        "title": title,
        "catch": catch,
        "description": description,
        "accepted": accepted,
        "limit": limit,
        "started_at": started_at,
        "place": place,
        "url": f"https://connpass.com/event/{event_id}/",
    }


CONFIG = {
    "min_accepted": 100,
    "keywords": ["AI", "React", "PdM"],
    "categories": {
        "AI": ["AI"],
        "フロント": ["React"],
        "PdM": ["PdM"],
    },
}


def test_filters_out_events_below_min_accepted():
    events = [make_event(title="AI Conf", accepted=50)]
    result = filter_events(events, CONFIG)
    assert result == []


def test_filters_out_events_with_no_keyword_match():
    events = [make_event(title="ただの飲み会", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result == []


def test_keeps_event_meeting_both_conditions():
    events = [make_event(event_id=1, title="AI Conference", accepted=200)]
    result = filter_events(events, CONFIG)
    assert len(result) == 1
    assert result[0]["event_id"] == 1


def test_matches_keyword_in_description():
    events = [make_event(title="勉強会", description="Reactの話をします", accepted=150)]
    result = filter_events(events, CONFIG)
    assert len(result) == 1
    assert "React" in result[0]["matched_keywords"]


def test_matches_keyword_case_insensitively():
    events = [make_event(title="ai meetup", accepted=150)]
    result = filter_events(events, CONFIG)
    assert len(result) == 1
    assert "AI" in result[0]["matched_keywords"]


def test_sorts_by_accepted_descending():
    events = [
        make_event(event_id=1, title="AI A", accepted=150),
        make_event(event_id=2, title="AI B", accepted=300),
        make_event(event_id=3, title="AI C", accepted=200),
    ]
    result = filter_events(events, CONFIG)
    assert [e["event_id"] for e in result] == [2, 3, 1]


def test_includes_matched_categories():
    events = [make_event(title="AI Conference", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result[0]["matched_categories"] == ["AI"]


def test_event_with_multiple_category_keywords_lists_both():
    events = [make_event(title="AI x React Hackathon", accepted=200)]
    result = filter_events(events, CONFIG)
    assert set(result[0]["matched_categories"]) == {"AI", "フロント"}


def test_output_includes_join_url():
    events = [make_event(event_id=42, title="AI Conf", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result[0]["join_url"] == "https://connpass.com/event/42/join/"


def test_join_url_uses_subdomain_url_when_provided():
    event = make_event(event_id=389503, title="AI Conf", accepted=200)
    event["url"] = "https://findy.connpass.com/event/389503/"
    result = filter_events([event], CONFIG)
    assert result[0]["join_url"] == "https://findy.connpass.com/event/389503/join/"


def test_empty_input_returns_empty_list():
    result = filter_events([], CONFIG)
    assert result == []
