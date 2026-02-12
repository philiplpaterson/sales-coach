# Sales Coach — Implementation Plan

> **Purpose:** This document is a step-by-step implementation plan for an AI-powered sales call coaching app. It is designed to be executed by Claude Code (or any LLM coding agent) inside a repo that already has a FastAPI project template.
>
> **What the app does:** Users practice sales calls by talking to an AI chatbot via voice. The AI plays the role of a prospect/customer. After the call, the user gets a coaching report with tonal analysis, filler word detection, talk speed, and conversation feedback.

---

## TABLE OF CONTENTS

1. [Tech Stack & Dependencies](#1-tech-stack--dependencies)
2. [Project Structure](#2-project-structure)
3. [Phase 1 — Backend Foundation](#3-phase-1--backend-foundation)
4. [Phase 2 — Voice Conversation Engine](#4-phase-2--voice-conversation-engine)
5. [Phase 3 — Tonal & Speech Analysis](#5-phase-3--tonal--speech-analysis)
6. [Phase 4 — Frontend](#6-phase-4--frontend)
7. [Phase 5 — Post-Call Coaching Dashboard](#7-phase-5--post-call-coaching-dashboard)
8. [Phase 6 — Integration & Polish](#8-phase-6--integration--polish)
9. [Environment Variables](#9-environment-variables)
10. [Testing Plan](#10-testing-plan)

---

## 1. Tech Stack & Dependencies

### Backend
- **FastAPI** (already in template)
- **WebSockets** (FastAPI native — for real-time audio streaming)
- **OpenAI Realtime API** (voice-to-voice conversation via WebSocket)
- **OpenAI Python SDK** (`openai>=1.0.0`)
- **Hume AI SDK** (`hume>=0.7.0`) — for post-call emotion/tone analysis
- **SQLite + SQLAlchemy** — for storing call sessions and analysis results
- **Pydantic** — for request/response models (already in FastAPI template)
- **python-dotenv** — for env vars
- **aiofiles** — for async file I/O (saving audio recordings)

### Frontend
- **Vanilla HTML/CSS/JS** (keep it simple, single-page app)
- **Web Audio API** — for capturing microphone input
- **WebSocket API** — for streaming audio to/from backend

### Install command (add to existing requirements.txt or pyproject.toml):
```
openai>=1.0.0
hume>=0.7.0
sqlalchemy>=2.0.0
aiosqlite>=0.19.0
python-dotenv>=1.0.0
aiofiles>=23.0.0
websockets>=12.0
```

---

## 2. Project Structure

Add the following files/folders to the existing FastAPI template. Do NOT modify the template's core structure — extend it.

```
sales-coach/
├── app/
│   ├── main.py                    # (EXTEND) — mount new routers
│   ├── config.py                  # (CREATE) — settings & env vars
│   ├── database.py                # (CREATE) — SQLAlchemy setup
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   └── session.py             # (CREATE) — DB models for call sessions
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── session.py             # (CREATE) — Pydantic schemas
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── calls.py               # (CREATE) — REST endpoints for call management
│   │   └── ws.py                  # (CREATE) — WebSocket endpoint for live calls
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── realtime_voice.py      # (CREATE) — OpenAI Realtime API integration
│   │   ├── tone_analysis.py       # (CREATE) — Hume AI integration
│   │   ├── speech_metrics.py      # (CREATE) — filler words, WPM, talk ratio
│   │   └── coaching_report.py     # (CREATE) — generates post-call feedback
│   │
│   └── prompts/
│       ├── __init__.py
│       └── sales_personas.py      # (CREATE) — system prompts for AI prospect
│
├── static/
│   ├── index.html                 # (CREATE) — main UI
│   ├── styles.css                 # (CREATE) — styling
│   └── app.js                     # (CREATE) — frontend JS
│
├── audio_recordings/              # (CREATE) — directory for saved call audio
├── .env                           # (CREATE) — API keys
└── requirements.txt               # (EXTEND) — add new dependencies
```

---

## 3. Phase 1 — Backend Foundation

**Goal:** Set up config, database, and basic REST endpoints.

### Task 1.1 — Create `app/config.py`
```python
"""
Create a Settings class using pydantic-settings (or plain os.getenv).
Fields needed:
- OPENAI_API_KEY: str
- HUME_API_KEY: str
- DATABASE_URL: str = "sqlite+aiosqlite:///./sales_coach.db"
- AUDIO_STORAGE_PATH: str = "./audio_recordings"
Load from .env file.
"""
```

### Task 1.2 — Create `app/database.py`
```python
"""
Set up async SQLAlchemy engine and session.
- Use aiosqlite as the async driver.
- Create an async sessionmaker.
- Create a `get_db` dependency for FastAPI.
- Add a `create_tables` coroutine to initialize DB on startup.
"""
```

### Task 1.3 — Create `app/models/session.py`
```python
"""
Define SQLAlchemy ORM model: CallSession
Columns:
- id: UUID (primary key)
- created_at: datetime (default=utcnow)
- duration_seconds: float (nullable, set after call ends)
- persona_used: str (which AI persona was used)
- status: str (enum: "active", "completed", "analyzing", "done")
- transcript: JSON/Text (full conversation transcript)
- audio_file_path: str (nullable, path to recorded audio)
- analysis_results: JSON (nullable, filled after analysis)
"""
```

### Task 1.4 — Create `app/schemas/session.py`
```python
"""
Pydantic schemas:
- CallSessionCreate: persona_used (str)
- CallSessionResponse: all fields from model
- CoachingReport: structured analysis output
  - overall_score: int (0-100)
  - tone_summary: str
  - filler_word_count: int
  - filler_words_detail: dict[str, int]
  - words_per_minute: float
  - talk_listen_ratio: float
  - confidence_score: float
  - energy_score: float
  - key_moments: list[dict] (timestamp + note)
  - recommendations: list[str]
"""
```

### Task 1.5 — Create `app/routers/calls.py`
```python
"""
REST endpoints:
- POST /api/calls/ — create a new call session, return session ID
- GET /api/calls/{session_id} — get call session details
- GET /api/calls/{session_id}/report — get coaching report (after analysis)
- GET /api/calls/ — list all call sessions (paginated)
"""
```

### Task 1.6 — Update `app/main.py`
```python
"""
- Import and include the calls router
- Add startup event to create DB tables
- Mount static files directory for frontend
- Add CORS middleware if needed
"""
```

**Checkpoint:** At this point, run the server. Verify:
- `POST /api/calls/` creates a session
- `GET /api/calls/{id}` returns it
- Database file is created

---

## 4. Phase 2 — Voice Conversation Engine

**Goal:** Enable real-time voice conversation between user and AI sales prospect via WebSocket.

### Task 2.1 — Create `app/prompts/sales_personas.py`
```python
"""
Define system prompts as string constants. Each persona is a different
type of prospect the user can practice with.

Create at least 3 personas:

1. FRIENDLY_PROSPECT:
   - Warm, interested, asks questions
   - Good for beginners
   - Will buy if pitched well

2. SKEPTICAL_PROSPECT:
   - Pushes back on everything
   - Asks tough questions about pricing, competitors
   - Needs strong objection handling

3. BUSY_EXECUTIVE:
   - Short attention span, wants the bottom line
   - Interrupts, says "get to the point"
   - Will hang up (end call) if not engaged quickly

Each prompt should include:
- Role description
- Behavioral instructions (how to respond, what objections to raise)
- Instruction to behave naturally and conversationally
- Instruction to NOT break character
- A scenario context (e.g., "You are the VP of Engineering at a mid-size
  SaaS company. The caller is trying to sell you a DevOps platform.")
"""
```

### Task 2.2 — Create `app/services/realtime_voice.py`
```python
"""
This service manages the WebSocket connection to OpenAI's Realtime API.

Key responsibilities:
1. Open a WebSocket to wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview
2. Send session.update event with:
   - The chosen sales persona system prompt
   - Voice setting (e.g., "alloy", "echo", or "shimmer")
   - Turn detection settings (server_vad with appropriate thresholds)
   - Input/output audio format (pcm16, 24kHz)
3. Relay audio:
   - Receive audio chunks from the user's browser WebSocket
   - Forward them to OpenAI as input_audio_buffer.append events
   - Receive response.audio.delta events from OpenAI
   - Forward the audio bytes back to the user's browser WebSocket
4. Capture transcript:
   - Listen for conversation.item.created and response.done events
   - Build a running transcript of the conversation
   - Store user and assistant messages with timestamps
5. Handle session lifecycle:
   - On connect: create OpenAI session
   - On disconnect: close OpenAI session, save transcript to DB

Class: RealtimeVoiceSession
Methods:
  - __init__(self, session_id: str, persona: str)
  - async connect() -> None
  - async send_user_audio(audio_bytes: bytes) -> None
  - async receive_ai_audio() -> AsyncGenerator[bytes, None]
  - async close() -> dict  # returns transcript
  - get_transcript() -> list[dict]

IMPORTANT NOTES FOR IMPLEMENTATION:
- OpenAI Realtime API uses WebSocket protocol
- Audio format: base64-encoded PCM16 at 24kHz, mono
- Events are JSON with a "type" field
- You must send audio as: {"type": "input_audio_buffer.append", "audio": "<base64>"}
- AI audio comes back as: {"type": "response.audio.delta", "delta": "<base64>"}
- Transcript text comes in: {"type": "response.audio_transcript.done", "transcript": "..."}
- User transcript comes in: {"type": "conversation.item.input_audio_transcription.completed", "transcript": "..."}
"""
```

### Task 2.3 — Create `app/routers/ws.py`
```python
"""
WebSocket endpoint for live voice calls.

Endpoint: WS /api/calls/{session_id}/ws

Flow:
1. Client connects via WebSocket
2. Server validates session_id exists and is in "active" status
3. Server creates a RealtimeVoiceSession with the session's persona
4. Server starts two concurrent tasks:
   a. user_to_ai: Read audio bytes from client WS → forward to OpenAI
   b. ai_to_user: Read audio bytes from OpenAI → forward to client WS
5. Also: save raw audio chunks to a file for later analysis
6. On disconnect:
   - Close the RealtimeVoiceSession
   - Save transcript to database
   - Update session status to "completed"
   - Update duration_seconds

IMPORTANT:
- Use asyncio.gather or TaskGroup to run both directions concurrently
- Handle disconnection gracefully (either side can close)
- Audio from client arrives as binary WebSocket frames
- Audio to client is sent as binary WebSocket frames
- Save a copy of ALL user audio to a .wav file for tonal analysis later
"""
```

### Task 2.4 — Audio Recording Logic
```python
"""
Inside the WebSocket handler (or as a utility):
- Open a WAV file writer at call start
- Write PCM16 24kHz mono audio frames as they arrive from the user
- Close and finalize the WAV file when the call ends
- Store the file path in the CallSession record

Use the `wave` module from Python stdlib:
  - sample_width=2 (16-bit)
  - channels=1
  - framerate=24000
"""
```

**Checkpoint:** At this point, test by:
- Creating a session via POST
- Connecting to the WebSocket
- Sending a short audio clip
- Verifying audio comes back from the AI
- Checking transcript is saved after disconnect

---

## 5. Phase 3 — Tonal & Speech Analysis

**Goal:** Analyze recorded audio after a call to produce coaching metrics.

### Task 3.1 — Create `app/services/tone_analysis.py`
```python
"""
Integration with Hume AI for emotion/tone analysis.

Function: async analyze_tone(audio_file_path: str) -> dict

Steps:
1. Read the saved .wav file from the call
2. Submit to Hume AI's Batch API (Expression Measurement)
   - Use the prosody model (analyzes voice tone)
   - This returns emotion scores per segment of audio
3. Parse the response to extract:
   - Average confidence score (from Hume's "Confidence" emotion)
   - Average energy/enthusiasm (from "Excitement", "Joy" emotions)
   - Hesitation indicators (from "Doubt", "Anxiety", "Confusion")
   - Tone shifts over time (array of scores at intervals)
4. Return a structured dict:
   {
     "confidence_avg": float,
     "energy_avg": float,
     "hesitation_avg": float,
     "tone_timeline": [
       {"timestamp": float, "confidence": float, "energy": float, ...}
     ],
     "dominant_emotions": [str],
     "emotion_details": dict
   }

FALLBACK: If Hume AI is unavailable or not configured:
- Return a placeholder dict with null values
- Log a warning
- The app should still work without tone analysis
"""
```

### Task 3.2 — Create `app/services/speech_metrics.py`
```python
"""
Compute speech metrics from the transcript.

Function: analyze_speech_metrics(transcript: list[dict], duration_seconds: float) -> dict

Input transcript format:
[
  {"role": "user", "text": "...", "timestamp": float},
  {"role": "assistant", "text": "...", "timestamp": float},
  ...
]

Compute:
1. **Words Per Minute (WPM)**
   - Count total words spoken by user
   - Divide by user's total speaking time in minutes
   - Ideal range: 130-160 WPM for sales calls

2. **Filler Word Detection**
   - Scan user's text for: "um", "uh", "like", "you know", "so", "basically",
     "actually", "right", "I mean", "sort of", "kind of"
   - Count each occurrence
   - Calculate filler ratio (fillers per minute)

3. **Talk-to-Listen Ratio**
   - Sum total word count for user vs assistant
   - Or sum estimated speaking duration for each
   - Ideal: 40-60% talk in discovery, 60-70% in pitch

4. **Longest Monologue**
   - Find the longest consecutive user turn (by word count)
   - Flag if any single turn exceeds 60 seconds equivalent

5. **Question Ratio**
   - Count sentences ending in "?" from user
   - Good salespeople ask lots of questions in discovery

Return:
{
  "words_per_minute": float,
  "filler_words": {"total": int, "per_minute": float, "breakdown": dict},
  "talk_listen_ratio": float,
  "longest_monologue_words": int,
  "questions_asked": int,
  "question_ratio": float
}
"""
```

### Task 3.3 — Create `app/services/coaching_report.py`
```python
"""
Combine tone analysis + speech metrics + transcript into a coaching report.

Function: async generate_coaching_report(session_id: str) -> CoachingReport

Steps:
1. Load the CallSession from DB
2. Run tone_analysis on the saved audio file
3. Run speech_metrics on the transcript
4. Use OpenAI Chat API (gpt-4o) to generate qualitative feedback:
   - Send the transcript + metrics as context
   - Ask it to:
     a. Score the overall call (0-100)
     b. Identify 3 key moments (positive or negative) with timestamps
     c. Provide 3-5 specific, actionable recommendations
     d. Summarize what the user did well
     e. Summarize what needs improvement
   - System prompt should instruct it to be a supportive but honest sales coach
5. Combine all data into CoachingReport schema
6. Save to the CallSession.analysis_results field
7. Update session status to "done"
8. Return the report

IMPORTANT: Run tone_analysis and speech_metrics concurrently with asyncio.gather
since they are independent of each other.
"""
```

### Task 3.4 — Add analysis trigger endpoint
```python
"""
In app/routers/calls.py, add:

POST /api/calls/{session_id}/analyze
- Validates the session is in "completed" status
- Sets status to "analyzing"
- Kicks off generate_coaching_report as a background task
- Returns 202 Accepted

This allows the frontend to trigger analysis and poll for results.
"""
```

**Checkpoint:** Test by:
- Completing a call (Phase 2)
- Triggering analysis
- Polling GET /api/calls/{id}/report until status is "done"
- Verifying the report contains all expected fields

---

## 6. Phase 4 — Frontend

**Goal:** Build a simple, clean single-page app for making calls and viewing reports.

### Task 4.1 — Create `static/index.html`
```html
<!--
Single page with three views (show/hide with JS, no framework needed):

VIEW 1: Call Setup
- Title: "Sales Coach"
- Subtitle: "Practice your sales calls with AI prospects"
- Persona selector (dropdown or cards for each persona)
- "Start Call" button
- Below: list of past sessions with links to reports

VIEW 2: Active Call
- Timer showing call duration
- Visual audio waveform or pulsing indicator (shows when user/AI is speaking)
- "End Call" button (large, red)
- Small text showing "AI is listening..." / "AI is speaking..."

VIEW 3: Coaching Report
- Overall score (large number, color-coded)
- Section: Tone Analysis (confidence, energy, hesitation gauges)
- Section: Speech Metrics (WPM, filler words, talk ratio)
- Section: Key Moments (timeline with notes)
- Section: Recommendations (bullet list)
- "Practice Again" button

Keep the design clean and minimal. Use a dark theme with accent colors.
-->
```

### Task 4.2 — Create `static/styles.css`
```css
/*
Dark theme, modern look:
- Background: #0f0f0f or #1a1a2e
- Cards: #16213e or #1e1e2e
- Accent: #00d4ff (cyan) or #4ade80 (green)
- Text: #e0e0e0
- Font: system-ui or Inter

Key styles needed:
- .call-setup, .active-call, .coaching-report (view containers)
- .persona-card (selectable cards)
- .score-display (large centered number)
- .metric-gauge (horizontal bar showing value in range)
- .timeline (vertical timeline for key moments)
- .pulse-indicator (CSS animation for active speaking)
- .btn-primary, .btn-danger
*/
```

### Task 4.3 — Create `static/app.js`
```javascript
/*
Main frontend logic. No build tools, no framework.

SECTIONS:

1. STATE MANAGEMENT
   - currentView: "setup" | "call" | "report"
   - currentSessionId: string | null
   - callStartTime: Date | null
   - mediaStream: MediaStream | null
   - websocket: WebSocket | null
   - audioContext: AudioContext | null

2. CALL SETUP
   - loadPastSessions() — GET /api/calls/ and render list
   - selectPersona(persona) — highlight selected persona card
   - startCall() — POST /api/calls/ then initiate WebSocket

3. AUDIO CAPTURE
   - requestMicAccess() — navigator.mediaDevices.getUserMedia({audio: true})
   - setupAudioProcessing():
     * Create AudioContext (sampleRate: 24000)
     * Create MediaStreamSource from mic
     * Create ScriptProcessorNode or AudioWorkletNode
     * On audio process: convert Float32 to PCM16, send via WebSocket
   - PCM16 conversion function:
     * Input: Float32Array (values -1.0 to 1.0)
     * Output: Int16Array (values -32768 to 32767)
     * Multiply each sample by 32767, clamp, cast to Int16

4. WEBSOCKET COMMUNICATION
   - connectWebSocket(sessionId):
     * Connect to ws://localhost:8000/api/calls/{sessionId}/ws
     * On open: start sending audio
     * On message (binary): queue audio for playback
     * On close: handle call end
   - Audio playback:
     * Receive PCM16 bytes from server
     * Convert to Float32
     * Create AudioBuffer, connect to AudioContext destination
     * Use a queue/buffer to prevent gaps

5. CALL CONTROLS
   - updateTimer() — update displayed duration every second
   - endCall() — close WebSocket, stop mic, switch to loading, trigger analysis
   - triggerAnalysis(sessionId) — POST /api/calls/{id}/analyze, then poll

6. REPORT DISPLAY
   - loadReport(sessionId) — GET /api/calls/{id}/report
   - renderReport(data) — populate all report sections
   - renderScoreGauge(score) — color-coded score display
   - renderMetricBar(value, min, max, ideal) — horizontal gauge
   - renderTimeline(moments) — vertical timeline with notes

7. AUDIO PLAYBACK QUEUE
   - Maintain a queue of audio buffers
   - Play them sequentially to avoid overlaps/gaps
   - Use AudioBufferSourceNode for each chunk
   - Track playback position to schedule next chunk

IMPORTANT NOTES:
- AudioContext must be created/resumed after user gesture (browser policy)
- Handle both binary and text WebSocket messages
- PCM16 audio is little-endian
- Sample rate must match between capture (24kHz) and playback (24kHz)
- Add error handling for mic permission denied
*/
```

**Checkpoint:** Test full flow:
1. Open browser to http://localhost:8000
2. Select a persona
3. Click Start Call
4. Speak and hear AI respond
5. Click End Call
6. See coaching report load

---

## 7. Phase 5 — Post-Call Coaching Dashboard

**Goal:** Make the coaching report visually compelling and useful.

### Task 5.1 — Enhanced Report Rendering
```javascript
/*
In app.js, expand the renderReport function:

OVERALL SCORE:
- Display as large number (e.g., "78/100")
- Color: red (<40), yellow (40-69), green (70-89), blue (90+)
- Subtitle: one-line summary from AI feedback

TONE ANALYSIS SECTION:
- Three horizontal gauges for: Confidence, Energy, Hesitation
- Each gauge: colored bar showing value from 0-100
- Small sparkline or mini-chart showing tone over time (optional)

SPEECH METRICS SECTION:
- WPM: show value + "ideal: 130-160" annotation
- Filler Words: show count + per-minute rate + top 3 filler words used
- Talk Ratio: pie chart or split bar (you vs. AI)
- Questions Asked: simple count with note about ideal

KEY MOMENTS SECTION:
- Vertical timeline
- Each item: timestamp + what happened + coaching note
- Color-coded: green for positive, orange for needs work

RECOMMENDATIONS SECTION:
- Numbered list of actionable tips
- Each recommendation is 1-2 sentences max

TRANSCRIPT SECTION (collapsible):
- Full conversation with role labels
- Filler words highlighted in yellow
- Key moments marked with indicators
*/
```

### Task 5.2 — Session History View
```javascript
/*
On the setup page, show past sessions:
- GET /api/calls/?limit=10
- Display as cards or table rows
- Each shows: date, persona used, duration, overall score
- Click to view full report
- Score shown as colored badge
*/
```

---

## 8. Phase 6 — Integration & Polish

### Task 6.1 — Error Handling
```
Add comprehensive error handling throughout:

Backend:
- WebSocket disconnection recovery
- OpenAI API rate limits / errors → graceful message to client
- Hume API failures → report still generates without tone data
- Invalid session states → proper HTTP error responses
- Audio file corruption → skip analysis with warning

Frontend:
- Microphone permission denied → show help message
- WebSocket disconnection → "Call dropped, reconnecting..." message
- Analysis takes too long → timeout after 120s with retry option
- Network errors → user-friendly error messages
```

### Task 6.2 — Audio Visualization (Optional Enhancement)
```javascript
/*
During active call, show a simple audio waveform:
- Use AnalyserNode from Web Audio API
- Get frequency data with getByteTimeDomainData()
- Draw on a <canvas> element
- Simple sine wave visualization
- Different color for user speaking vs AI speaking
*/
```

### Task 6.3 — Static File Serving
```python
"""
In main.py, ensure:
- StaticFiles is mounted for /static → ./static
- A catch-all route serves index.html for the root path
- CORS is configured for local development
- Audio recordings directory is created on startup
"""
```

### Task 6.4 — Startup Script
```bash
# Create a run.sh or document in README:
# 1. cp .env.example .env  (then fill in API keys)
# 2. pip install -r requirements.txt
# 3. mkdir -p audio_recordings
# 4. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 9. Environment Variables

Create `.env.example`:
```
OPENAI_API_KEY=sk-your-openai-key-here
HUME_API_KEY=your-hume-api-key-here
DATABASE_URL=sqlite+aiosqlite:///./sales_coach.db
AUDIO_STORAGE_PATH=./audio_recordings
```

---

## 10. Testing Plan

### Manual Testing Checklist
```
[ ] Server starts without errors
[ ] POST /api/calls/ creates a session and returns ID
[ ] GET /api/calls/ lists sessions
[ ] WebSocket connects to /api/calls/{id}/ws
[ ] Microphone audio is captured in browser
[ ] Audio is relayed to OpenAI and AI responds
[ ] AI audio plays back in browser
[ ] Transcript is saved after call ends
[ ] Audio .wav file is saved after call ends
[ ] POST /api/calls/{id}/analyze triggers analysis
[ ] Tone analysis returns results (or graceful fallback)
[ ] Speech metrics compute correctly
[ ] Coaching report generates with all fields
[ ] GET /api/calls/{id}/report returns full report
[ ] Frontend displays report correctly
[ ] Past sessions are listed and clickable
[ ] Error states are handled gracefully
```

### API Smoke Tests (write as pytest)
```python
"""
Create tests/test_calls.py:
- test_create_session: POST /api/calls/ → 201
- test_get_session: create then GET → 200 with correct data
- test_list_sessions: create 3, GET /api/calls/ → 200 with 3 items
- test_get_nonexistent_session: GET /api/calls/fake-id → 404
- test_analyze_without_completion: POST analyze on active session → 400
"""
```

---

## EXECUTION ORDER SUMMARY

Execute phases in order. Each phase builds on the previous one.

```
Phase 1: Backend Foundation (Tasks 1.1-1.6)
   → Verify: REST API works, DB stores sessions

Phase 2: Voice Conversation (Tasks 2.1-2.4)
   → Verify: Can have a voice conversation via WebSocket

Phase 3: Analysis Services (Tasks 3.1-3.4)
   → Verify: Post-call analysis produces a report

Phase 4: Frontend (Tasks 4.1-4.3)
   → Verify: Full UI flow works in browser

Phase 5: Enhanced Dashboard (Tasks 5.1-5.2)
   → Verify: Report is visually clear and useful

Phase 6: Polish (Tasks 6.1-6.4)
   → Verify: Error handling, startup, documentation
```

**Each task should be committed separately with a descriptive commit message.**