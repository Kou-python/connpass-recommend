from unittest.mock import MagicMock, patch

from scripts.fetch import USER_AGENT, fetch_events


def _make_response(payload: dict) -> MagicMock:
    response = MagicMock()
    response.json.return_value = payload
    response.raise_for_status = MagicMock()
    return response


@patch("scripts.fetch.time.sleep")
@patch("scripts.fetch.requests.get")
def test_fetch_events_sends_api_key_and_user_agent(mock_get: MagicMock, mock_sleep: MagicMock):
    mock_get.return_value = _make_response({
        "events": [],
        "results_returned": 0,
        "results_available": 0,
    })

    fetch_events("test-api-key", 1)

    _, kwargs = mock_get.call_args
    assert kwargs["headers"] == {
        "X-API-Key": "test-api-key",
        "User-Agent": USER_AGENT,
    }
    assert kwargs["timeout"] == 30
