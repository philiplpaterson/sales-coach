COACHING_EMOTIONS = {
    "Confidence": ["Determination", "Confidence", "Conviction"],
    "Enthusiasm": ["Excitement", "Joy", "Interest"],
    "Hesitation": ["Doubt", "Confusion", "Anxiety"],
    "Empathy": ["Sympathy", "Compassion", "Understanding"],
    "Frustration": ["Anger", "Annoyance", "Contempt"],
}


def summarize_emotions(emotion_data: dict) -> dict:
    """Summarize raw EVI prosody scores into coaching-relevant dimensions."""
    prosody_scores = emotion_data.get("prosody_scores", [])
    if not prosody_scores:
        return _empty_summary()

    # Collect all user emotion readings
    user_readings = [
        s for s in prosody_scores if s.get("role") == "user"
    ]
    if not user_readings:
        return _empty_summary()

    # Compute averages for coaching dimensions
    dimension_scores: dict[str, list[float]] = {
        dim: [] for dim in COACHING_EMOTIONS
    }

    for reading in user_readings:
        emotions = reading.get("emotions", {})
        for dimension, related_emotions in COACHING_EMOTIONS.items():
            scores = [
                emotions.get(e, 0.0) for e in related_emotions
                if e in emotions
            ]
            if scores:
                dimension_scores[dimension].append(
                    sum(scores) / len(scores)
                )

    averages: dict[str, float] = {}
    for dimension, scores in dimension_scores.items():
        if scores:
            averages[dimension] = round(sum(scores) / len(scores), 3)
        else:
            averages[dimension] = 0.0

    # Identify dominant emotions
    dominant = sorted(averages.items(), key=lambda x: x[1], reverse=True)

    # Build tone timeline (every reading as a data point)
    timeline = []
    for i, reading in enumerate(user_readings):
        emotions = reading.get("emotions", {})
        point: dict = {
            "index": i,
            "timestamp": reading.get("timestamp"),
        }
        for dimension, related_emotions in COACHING_EMOTIONS.items():
            scores = [
                emotions.get(e, 0.0) for e in related_emotions
                if e in emotions
            ]
            point[dimension] = round(sum(scores) / len(scores), 3) if scores else 0.0
        timeline.append(point)

    return {
        "dimension_averages": averages,
        "dominant_emotions": [
            {"dimension": d, "score": s} for d, s in dominant[:3]
        ],
        "timeline": timeline,
        "total_readings": len(user_readings),
    }


def _empty_summary() -> dict:
    return {
        "dimension_averages": {dim: 0.0 for dim in COACHING_EMOTIONS},
        "dominant_emotions": [],
        "timeline": [],
        "total_readings": 0,
    }
