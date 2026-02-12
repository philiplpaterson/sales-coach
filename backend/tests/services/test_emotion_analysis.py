from app.services.emotion_analysis import summarize_emotions


def test_basic_summary() -> None:
    emotion_data = {
        "prosody_scores": [
            {
                "role": "user",
                "emotions": {
                    "Determination": 0.8,
                    "Confidence": 0.7,
                    "Excitement": 0.6,
                    "Joy": 0.5,
                    "Interest": 0.4,
                    "Doubt": 0.1,
                },
                "timestamp": 1000,
            },
            {
                "role": "user",
                "emotions": {
                    "Determination": 0.9,
                    "Confidence": 0.8,
                    "Excitement": 0.7,
                    "Joy": 0.6,
                    "Interest": 0.5,
                    "Doubt": 0.2,
                },
                "timestamp": 2000,
            },
        ]
    }

    result = summarize_emotions(emotion_data)

    assert result["total_readings"] == 2
    assert result["dimension_averages"]["Confidence"] > 0
    assert result["dimension_averages"]["Enthusiasm"] > 0
    assert len(result["dominant_emotions"]) <= 3
    assert len(result["timeline"]) == 2


def test_empty_data() -> None:
    result = summarize_emotions({})
    assert result["total_readings"] == 0
    assert result["dominant_emotions"] == []


def test_no_user_readings() -> None:
    emotion_data = {
        "prosody_scores": [
            {
                "role": "assistant",
                "emotions": {"Confidence": 0.8},
                "timestamp": 1000,
            }
        ]
    }
    result = summarize_emotions(emotion_data)
    assert result["total_readings"] == 0


def test_timeline_has_dimensions() -> None:
    emotion_data = {
        "prosody_scores": [
            {
                "role": "user",
                "emotions": {"Determination": 0.5, "Excitement": 0.3},
                "timestamp": 1000,
            }
        ]
    }
    result = summarize_emotions(emotion_data)

    timeline = result["timeline"]
    assert len(timeline) == 1
    point = timeline[0]
    assert "Confidence" in point
    assert "Enthusiasm" in point
    assert "Hesitation" in point
