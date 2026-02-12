from app.services.speech_metrics import analyze_speech_metrics


def test_basic_metrics() -> None:
    transcript = {
        "messages": [
            {"role": "user", "text": "Hello, I wanted to discuss our product with you today."},
            {"role": "assistant", "text": "Sure, tell me more about what you offer."},
            {"role": "user", "text": "We offer a platform that helps teams collaborate better. Do you have collaboration challenges?"},
            {"role": "assistant", "text": "Yes, we struggle with remote communication."},
        ]
    }
    result = analyze_speech_metrics(transcript, duration_seconds=60.0)

    assert result["total_user_words"] > 0
    assert result["total_assistant_words"] > 0
    assert result["words_per_minute"] > 0
    assert result["questions_asked"] == 1
    assert result["message_count"]["user"] == 2
    assert result["message_count"]["assistant"] == 2
    assert "talk_listen_ratio" in result


def test_filler_words() -> None:
    transcript = {
        "messages": [
            {"role": "user", "text": "Um, so like, I basically wanted to, you know, talk about our product."},
            {"role": "assistant", "text": "Go ahead."},
        ]
    }
    result = analyze_speech_metrics(transcript, duration_seconds=30.0)

    fillers = result["filler_words"]
    assert fillers["total"] > 0
    assert fillers["breakdown"]["um"] >= 1
    assert fillers["breakdown"]["like"] >= 1
    assert fillers["breakdown"]["basically"] >= 1
    assert fillers["breakdown"]["you know"] >= 1


def test_empty_transcript() -> None:
    result = analyze_speech_metrics({"messages": []}, duration_seconds=60.0)
    assert result["words_per_minute"] == 0
    assert result["questions_asked"] == 0


def test_zero_duration() -> None:
    transcript = {
        "messages": [
            {"role": "user", "text": "Hello."},
        ]
    }
    result = analyze_speech_metrics(transcript, duration_seconds=0)
    assert result["words_per_minute"] == 0


def test_wpm_assessment() -> None:
    # Slow speaker: 50 words in 60 seconds = 50 wpm
    slow_transcript = {
        "messages": [{"role": "user", "text": " ".join(["word"] * 50)}]
    }
    result = analyze_speech_metrics(slow_transcript, duration_seconds=60.0)
    assert result["wpm_assessment"] == "too_slow"

    # Fast speaker: 200 words in 60 seconds = 200 wpm
    fast_transcript = {
        "messages": [{"role": "user", "text": " ".join(["word"] * 200)}]
    }
    result = analyze_speech_metrics(fast_transcript, duration_seconds=60.0)
    assert result["wpm_assessment"] == "too_fast"
