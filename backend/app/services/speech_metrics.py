import re

FILLER_WORDS = {
    "um", "uh", "uh-huh", "like", "you know", "basically", "actually",
    "literally", "honestly", "right", "so", "well", "i mean", "sort of",
    "kind of",
}


def analyze_speech_metrics(transcript: dict, duration_seconds: float) -> dict:
    """Analyze speech metrics from a call transcript."""
    messages = transcript.get("messages", [])
    if not messages or duration_seconds <= 0:
        return _empty_metrics()

    user_messages = [m for m in messages if m.get("role") == "user"]
    assistant_messages = [m for m in messages if m.get("role") == "assistant"]

    user_text = " ".join(m.get("text", "") for m in user_messages)
    assistant_text = " ".join(m.get("text", "") for m in assistant_messages)

    user_words = _count_words(user_text)
    assistant_words = _count_words(assistant_text)
    total_words = user_words + assistant_words

    duration_minutes = duration_seconds / 60.0

    # Words per minute (user only)
    wpm = round(user_words / duration_minutes, 1) if duration_minutes > 0 else 0

    # Filler words
    filler_counts = _count_fillers(user_text)
    total_fillers = sum(filler_counts.values())
    filler_rate = round(total_fillers / duration_minutes, 1) if duration_minutes > 0 else 0

    # Talk-listen ratio (user words / total words)
    talk_ratio = round((user_words / total_words) * 100, 1) if total_words > 0 else 0

    # Longest monologue (longest consecutive user turn by word count)
    longest_monologue = 0
    for m in user_messages:
        word_count = _count_words(m.get("text", ""))
        if word_count > longest_monologue:
            longest_monologue = word_count

    # Questions asked
    questions_asked = sum(
        1 for m in user_messages
        if m.get("text", "").strip().endswith("?")
    )

    return {
        "words_per_minute": wpm,
        "wpm_assessment": _assess_wpm(wpm),
        "total_user_words": user_words,
        "total_assistant_words": assistant_words,
        "filler_words": {
            "total": total_fillers,
            "per_minute": filler_rate,
            "breakdown": {k: v for k, v in filler_counts.items() if v > 0},
        },
        "talk_listen_ratio": {
            "user_percent": talk_ratio,
            "prospect_percent": round(100 - talk_ratio, 1),
            "assessment": _assess_talk_ratio(talk_ratio),
        },
        "longest_monologue_words": longest_monologue,
        "questions_asked": questions_asked,
        "message_count": {
            "user": len(user_messages),
            "assistant": len(assistant_messages),
        },
    }


def _count_words(text: str) -> int:
    return len(text.split()) if text.strip() else 0


def _count_fillers(text: str) -> dict[str, int]:
    text_lower = text.lower()
    counts: dict[str, int] = {}
    for filler in FILLER_WORDS:
        pattern = r"\b" + re.escape(filler) + r"\b"
        counts[filler] = len(re.findall(pattern, text_lower))
    return counts


def _assess_wpm(wpm: float) -> str:
    if wpm < 110:
        return "too_slow"
    elif wpm <= 160:
        return "ideal"
    else:
        return "too_fast"


def _assess_talk_ratio(user_percent: float) -> str:
    if user_percent < 30:
        return "too_quiet"
    elif user_percent <= 60:
        return "ideal"
    else:
        return "talking_too_much"


def _empty_metrics() -> dict:
    return {
        "words_per_minute": 0,
        "wpm_assessment": "no_data",
        "total_user_words": 0,
        "total_assistant_words": 0,
        "filler_words": {"total": 0, "per_minute": 0, "breakdown": {}},
        "talk_listen_ratio": {
            "user_percent": 0,
            "prospect_percent": 0,
            "assessment": "no_data",
        },
        "longest_monologue_words": 0,
        "questions_asked": 0,
        "message_count": {"user": 0, "assistant": 0},
    }
