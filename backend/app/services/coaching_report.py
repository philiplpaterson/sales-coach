import json
import logging
import uuid
from datetime import datetime

from openai import OpenAI
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.models import CallSession
from app.services.emotion_analysis import summarize_emotions
from app.services.speech_metrics import analyze_speech_metrics

logger = logging.getLogger(__name__)

COACHING_SYSTEM_PROMPT = """You are an expert sales coach analyzing a practice sales call.
You will receive:
1. The full transcript of the call
2. Speech metrics (WPM, filler words, talk-listen ratio, etc.)
3. Emotion/tone analysis from voice prosody

Provide a detailed coaching report in the following JSON format:
{
    "overall_score": <0-100 integer>,
    "tone_summary": "<2-3 sentence summary of the salesperson's tone and delivery>",
    "key_moments": [
        {
            "type": "strength" or "needs_work",
            "description": "<what happened>",
            "suggestion": "<actionable advice>"
        }
    ],
    "recommendations": ["<specific actionable recommendation>", ...],
    "strengths": ["<observed strength>", ...],
    "areas_for_improvement": ["<specific area>", ...]
}

Scoring guide:
- 90-100: Exceptional - masterful rapport, perfect objection handling, strong close
- 70-89: Good - solid fundamentals with minor areas to improve
- 40-69: Developing - shows promise but needs work on key areas
- 0-39: Needs significant improvement - major gaps in technique

Be specific, actionable, and encouraging. Reference specific moments from the transcript."""


def generate_coaching_report(call_session_id: uuid.UUID) -> None:
    """Generate a coaching report for a completed call session.

    Runs as a background task with its own DB session.
    """
    with Session(engine) as session:
        call = session.get(CallSession, call_session_id)
        if not call:
            logger.error(f"CallSession {call_session_id} not found")
            return

        if not call.transcript or not call.duration_seconds:
            call.status = "error"
            call.analysis_results = {"error": "Missing transcript or duration data"}
            session.add(call)
            session.commit()
            return

        try:
            call.status = "analyzing"
            session.add(call)
            session.commit()

            # Run speech metrics analysis
            speech_metrics = analyze_speech_metrics(
                call.transcript, call.duration_seconds
            )

            # Run emotion analysis
            emotion_summary = summarize_emotions(call.emotion_data or {})

            # Build prompt for OpenAI
            user_prompt = _build_analysis_prompt(
                call.transcript, speech_metrics, emotion_summary, call.persona
            )

            # Call OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": COACHING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
            )

            report_text = response.choices[0].message.content
            report_data = json.loads(report_text) if report_text else {}

            # Combine all analysis into results
            call.analysis_results = {
                **report_data,
                "speech_metrics": speech_metrics,
                "emotion_summary": emotion_summary,
            }
            call.status = "done"
            session.add(call)
            session.commit()

        except Exception:
            logger.exception(
                f"Failed to generate coaching report for session {call_session_id}"
            )
            session.rollback()
            # Re-fetch after rollback
            call = session.get(CallSession, call_session_id)
            if call:
                call.status = "error"
                call.analysis_results = {"error": "Analysis failed. Please try again."}
                session.add(call)
                session.commit()


def _build_analysis_prompt(
    transcript: dict,
    speech_metrics: dict,
    emotion_summary: dict,
    persona: str,
) -> str:
    messages = transcript.get("messages", [])
    transcript_text = "\n".join(
        f"[{m.get('role', 'unknown').upper()}]: {m.get('text', '')}"
        for m in messages
    )

    return f"""## Call Context
Persona: {persona}

## Transcript
{transcript_text}

## Speech Metrics
- Words per minute: {speech_metrics.get('words_per_minute', 'N/A')} ({speech_metrics.get('wpm_assessment', 'N/A')})
- Filler words: {speech_metrics.get('filler_words', {}).get('total', 0)} total ({speech_metrics.get('filler_words', {}).get('per_minute', 0)}/min)
- Talk-listen ratio: User {speech_metrics.get('talk_listen_ratio', {}).get('user_percent', 0)}% / Prospect {speech_metrics.get('talk_listen_ratio', {}).get('prospect_percent', 0)}%
- Questions asked: {speech_metrics.get('questions_asked', 0)}
- Longest monologue: {speech_metrics.get('longest_monologue_words', 0)} words

## Emotion Analysis
- Dimension averages: {json.dumps(emotion_summary.get('dimension_averages', {}), indent=2)}
- Dominant emotions: {json.dumps(emotion_summary.get('dominant_emotions', []), indent=2)}

Please provide your coaching analysis in the specified JSON format."""
