"""tests/test_fetch_applied.py — extract_event_ids の純粋関数テスト。"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import requests

from scripts.fetch_applied import extract_event_ids, fetch_applied_ids


# ---------------------------------------------------------------------------
# extract_event_ids
# ---------------------------------------------------------------------------

class TestExtractEventIds:
    def test_single_id(self):
        html = '<a href="/event/12345/">イベント名</a>'
        assert extract_event_ids(html) == [12345]

    def test_multiple_ids_in_order(self):
        html = (
            '<a href="/event/100/">A</a>'
            '<a href="/event/200/">B</a>'
            '<a href="/event/300/">C</a>'
        )
        assert extract_event_ids(html) == [100, 200, 300]

    def test_duplicates_deduplicated(self):
        html = (
            '<a href="/event/42/">first</a>'
            '<a href="/event/42/">duplicate</a>'
            '<a href="/event/99/">other</a>'
        )
        assert extract_event_ids(html) == [42, 99]

    def test_full_url_form(self):
        html = '<a href="https://connpass.com/event/123/">フルURL形式</a>'
        assert extract_event_ids(html) == [123]

    def test_empty_html(self):
        assert extract_event_ids("") == []

    def test_no_event_ids(self):
        html = "<html><body><p>イベントなし</p></body></html>"
        assert extract_event_ids(html) == []

    def test_trailing_path_after_id(self):
        """'/event/{id}/join/' のような末尾パスがあっても id を正しく取る。"""
        html = '<a href="/event/555/join/">参加する</a>'
        assert extract_event_ids(html) == [555]

    def test_mixed_full_and_relative_urls(self):
        html = (
            '<a href="https://connpass.com/event/10/">A</a>'
            '<a href="/event/20/">B</a>'
        )
        result = extract_event_ids(html)
        assert result == [10, 20]

    def test_preserves_first_occurrence_order_with_duplicates(self):
        """出現順が保持され、後続の重複は無視される。"""
        html = (
            '<a href="/event/3/">C</a>'
            '<a href="/event/1/">A</a>'
            '<a href="/event/2/">B</a>'
            '<a href="/event/1/">A dup</a>'
        )
        assert extract_event_ids(html) == [3, 1, 2]


# ---------------------------------------------------------------------------
# fetch_applied_ids — requests をモックしたページネーション・終端ロジックのテスト
# ---------------------------------------------------------------------------

def _make_response(html: str, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = html
    resp.raise_for_status = MagicMock()
    return resp


def _html_with_ids(*event_ids: int) -> str:
    links = "".join(f'<a href="/event/{eid}/">event</a>' for eid in event_ids)
    return f"<html><body>{links}</body></html>"


class TestFetchAppliedIds:
    @patch("scripts.fetch_applied.time.sleep")
    @patch("scripts.fetch_applied.requests.get")
    def test_single_page(self, mock_get: MagicMock, mock_sleep: MagicMock):
        """1ページで終端（2ページ目が1ページ目と同じ → clamp 検出）。"""
        page1 = _html_with_ids(1, 2, 3)
        mock_get.side_effect = [
            _make_response(page1),
            _make_response(page1),  # クランプ: 同じ内容が返る
        ]
        result = fetch_applied_ids("testuser")
        assert result == [1, 2, 3]

    @patch("scripts.fetch_applied.time.sleep")
    @patch("scripts.fetch_applied.requests.get")
    def test_two_pages(self, mock_get: MagicMock, mock_sleep: MagicMock):
        """2ページ分のデータを正しく結合する。"""
        page1 = _html_with_ids(1, 2, 3)
        page2 = _html_with_ids(4, 5, 6)
        # 3ページ目はクランプ（page2 と同じ）
        mock_get.side_effect = [
            _make_response(page1),
            _make_response(page2),
            _make_response(page2),
        ]
        result = fetch_applied_ids("testuser")
        assert result == [1, 2, 3, 4, 5, 6]

    @patch("scripts.fetch_applied.time.sleep")
    @patch("scripts.fetch_applied.requests.get")
    def test_empty_first_page(self, mock_get: MagicMock, mock_sleep: MagicMock):
        """1ページ目が空なら即終了して空リストを返す。"""
        mock_get.return_value = _make_response("<html></html>")
        result = fetch_applied_ids("testuser")
        assert result == []

    @patch("scripts.fetch_applied.time.sleep")
    @patch("scripts.fetch_applied.requests.get")
    def test_sleep_called_between_pages(self, mock_get: MagicMock, mock_sleep: MagicMock):
        """2ページ目以降の取得前に sleep(1) が呼ばれる（1ページ目の前は呼ばれない）。"""
        page1 = _html_with_ids(10, 11)
        page2 = _html_with_ids(12, 13)
        mock_get.side_effect = [
            _make_response(page1),
            _make_response(page2),
            _make_response(page2),  # clamp
        ]
        fetch_applied_ids("testuser")
        # get は3回（page1, page2, clamp確認）→ sleep は page2前・clamp前の2回
        assert mock_sleep.call_count == 2

    @patch("scripts.fetch_applied.time.sleep")
    @patch("scripts.fetch_applied.requests.get")
    def test_network_error_propagates(self, mock_get: MagicMock, mock_sleep: MagicMock):
        """ネットワーク例外は RequestException として呼び出し元に伝播する。"""
        mock_get.side_effect = requests.exceptions.Timeout("timeout")
        try:
            fetch_applied_ids("testuser")
            assert False, "例外が送出されるべき"
        except requests.exceptions.RequestException:
            pass
