 Sales Coach — Implementation Plan

 Context

 We're building an AI-powered sales coaching web app on top of the existing FastAPI + React template at /home/philip/Documents/github/sales-coach. Users practice sales
 calls by having real-time voice conversations with AI prospect personas. During the call, the user sees live emotion/tone feedback. After the call, they receive a
 detailed coaching report with speech metrics and recommendations.

 Core technology choice: Hume AI EVI (Empathic Voice Interface) — a unified service that handles speech-to-text, emotion detection from voice prosody, LLM response
 generation, and text-to-speech all through a single WebSocket connection. This eliminates the need for separate voice and analysis services.

 Architecture

 ┌─────────────────────────────────────────────────────────────┐
 │  React Frontend (@humeai/voice-react)                       │
 │  - Gets Hume access token from backend                      │
 │  - Connects DIRECTLY to Hume EVI via WebSocket              │
 │  - Collects transcript + emotion data during call           │
 │  - Sends collected data to backend when call ends           │
 └──────┬──────────────────────────────────┬───────────────────┘
        │ REST API                         │ WebSocket (direct)
        ▼                                  ▼
 ┌──────────────┐                  ┌──────────────┐
 │  FastAPI     │ OAuth2 token     │  Hume EVI    │
 │  Backend     │ ─────────────►   │  Service     │
 │              │                  │  (STT+Emotion│
 │  - Token gen │                  │   +LLM+TTS)  │
 │  - Call CRUD │                  └──────────────┘
 │  - Analysis  │
 │  - Reports   │
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │  PostgreSQL  │
 │  (existing)  │
 └──────────────┘

 Key flows:
 1. Token flow: Frontend requests a Hume access token from backend. Backend uses HUME_API_KEY + HUME_SECRET_KEY via OAuth2 client credentials to mint a short-lived token.
 2. Voice call flow: Frontend connects directly to Hume EVI using @humeai/voice-react. EVI handles all real-time voice processing. Frontend collects transcript messages
 and prosody (emotion) scores as they arrive.
 3. Post-call flow: Frontend sends transcript + emotion data to backend. Backend runs speech metrics analysis, generates a coaching report via OpenAI, and stores
 everything in PostgreSQL.

 ---
 Phase 1: Backend Foundation

 1.1 Update config

 Modify: backend/app/core/config.py (line 71-75)

 Replace the existing sales coach settings with:
 OPENAI_API_KEY: str = ""
 HUME_API_KEY: str = ""
 HUME_SECRET_KEY: str = ""
 HUME_CONFIG_ID: str = ""  # EVI config ID from Hume dashboard

 Remove SALES_COACH_DATABASE_URL and AUDIO_STORAGE_PATH (we use existing PostgreSQL, and EVI handles audio client-side).

 1.2 Add database models and schemas

 Modify: backend/app/models.py

 Add new models following the existing Item/ItemBase/ItemCreate/ItemPublic pattern:

 CallSession table model:
 - id: uuid.UUID (PK)
 - owner_id: uuid.UUID (FK → user.id, CASCADE)
 - persona: str (e.g. "friendly_prospect")
 - scenario: str | None
 - created_at: datetime
 - ended_at: datetime | None
 - duration_seconds: float | None
 - status: str — "active" → "completed" → "analyzing" → "done" | "error"
 - hume_chat_id: str | None
 - transcript: dict | None (JSON column — { messages: [{ role, text, timestamp }] })
 - emotion_data: dict | None (JSON column — { prosody_scores: [...] })
 - analysis_results: dict | None (JSON column — full coaching report data)

 Pydantic schemas (non-table):
 - CallSessionCreate(persona, scenario?)
 - CallSessionPublic(id, owner_id, persona, scenario, created_at, ended_at, duration_seconds, status)
 - CallSessionsPublic(data: list[CallSessionPublic], count: int)
 - CallSessionComplete(duration_seconds, transcript, emotion_data, hume_chat_id?)
 - CoachingReportPublic — structured report fields (overall_score, tone_summary, speech_metrics, emotion_summary, key_moments, recommendations, strengths,
 areas_for_improvement)
 - HumeTokenResponse(access_token, expires_in)

 Add call_sessions relationship on the User model (line 46).

 1.3 Alembic migration

 Run alembic revision --autogenerate -m "add call session table" after models are defined to create the migration for the callsession table. The JSON columns map to
 PostgreSQL's native jsonb.

 1.4 Call management routes

 Create: backend/app/api/routes/calls.py

 Following the exact pattern from backend/app/api/routes/items.py:
 ┌───────────────────────────┬────────┬────────────────────────────────────────────────────────────┐
 │         Endpoint          │ Method │                        Description                         │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/                   │ POST   │ Create a new call session                                  │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/                   │ GET    │ List user's call sessions (paginated, newest first)        │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/{call_id}          │ GET    │ Get a single call session                                  │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/{call_id}/complete │ POST   │ Store transcript + emotion data, set status="completed"    │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/{call_id}/analyze  │ POST   │ Trigger background coaching report generation              │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/{call_id}/report   │ GET    │ Get the coaching report (from analysis_results JSON field) │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/{call_id}          │ DELETE │ Delete a call session                                      │
 ├───────────────────────────┼────────┼────────────────────────────────────────────────────────────┤
 │ /calls/personas/list      │ GET    │ List available sales personas                              │
 └───────────────────────────┴────────┴────────────────────────────────────────────────────────────┘
 All endpoints use CurrentUser and SessionDep dependencies, with ownership validation.

 1.5 Hume token route

 Create: backend/app/api/routes/hume.py

 Single endpoint GET /hume/token that:
 1. Requires CurrentUser auth
 2. POSTs to https://api.hume.ai/oauth2-cc/token with grant_type=client_credentials using HUME_API_KEY + HUME_SECRET_KEY as HTTP Basic auth
 3. Returns { access_token, expires_in }

 Uses httpx.AsyncClient for the outbound request.

 1.6 Register routers

 Modify: backend/app/api/main.py

 Add:
 from app.api.routes import calls, hume
 api_router.include_router(calls.router)
 api_router.include_router(hume.router)

 1.7 Sales persona definitions

 Create: backend/app/services/__init__.py (empty)
 Create: backend/app/services/sales_personas.py

 Dict of 3 personas with name, description, and system prompt:
 - Friendly Prospect — warm, interested, good for beginners
 - Skeptical Buyer — pushes back, tests objection handling
 - Busy Executive — short attention span, wants bottom line fast

 Each system prompt includes role description, behavioral instructions, scenario context, and instruction to stay in character.

 Checkpoint: Server starts, POST /api/v1/calls/ creates a session, GET /api/v1/hume/token returns a valid Hume token.

 ---
 Phase 2: Frontend Voice UI

 2.1 Install Hume voice package

 Modify: frontend/package.json

 Add "@humeai/voice-react" as a dependency.

 2.2 Practice call page

 Create: frontend/src/routes/_layout/practice.tsx

 Following the pattern from frontend/src/routes/_layout/items.tsx:
 - Route: /_layout/practice
 - State machine: setup → calling → processing → report
 - Renders different sub-components based on state

 2.3 Call setup component

 Create: frontend/src/components/Practice/CallSetup.tsx

 - Fetches personas from GET /api/v1/calls/personas/list
 - Displays as selectable cards (using Radix UI + Tailwind)
 - "Start Call" button that:
   a. POST /api/v1/calls/ to create a session
   b. GET /api/v1/hume/token to get access token
   c. Transitions to calling state with token + session ID

 2.4 Active call component (core EVI integration)

 Create: frontend/src/components/Practice/ActiveCall.tsx

 Uses @humeai/voice-react:

 <VoiceProvider
   auth={{ type: "accessToken", value: accessToken }}
   configId={configId}
   onMessage={handleMessage}   // collect transcript + emotion scores
   onClose={handleCallEnd}
 >
   <ActiveCallUI />
 </VoiceProvider>

 The ActiveCallUI uses the useVoice() hook for connect, disconnect, status, messages. Displays:
 - Call timer
 - Connection status
 - Real-time emotion bars (from prosody scores in each message)
 - Live scrolling transcript
 - "End Call" button

 On call end:
 1. disconnect()
 2. POST /api/v1/calls/{id}/complete with collected transcript + emotion data
 3. POST /api/v1/calls/{id}/analyze to trigger report
 4. Transition to processing/report state

 2.5 Real-time emotion display

 Create: frontend/src/components/Practice/EmotionDisplay.tsx

 Shows top emotions (Confidence, Enthusiasm, Doubt, etc.) as animated colored bars that update as new prosody scores arrive from EVI messages.

 2.6 Coaching report component

 Create: frontend/src/components/Practice/CoachingReport.tsx

 Polls GET /api/v1/calls/{id}/report until status is "done". Displays:
 - Overall score (large, color-coded: red < 40, yellow 40-69, green 70-89, blue 90+)
 - Tone summary paragraph
 - Speech metrics gauges (WPM, filler words, talk-listen ratio, questions asked)
 - Key moments timeline (color-coded positive/needs-work)
 - Recommendations list
 - Collapsible full transcript

 2.7 Update sidebar navigation

 Modify: frontend/src/components/Sidebar/AppSidebar.tsx

 Add to baseItems:
 import { Phone, History } from "lucide-react"

 const baseItems: Item[] = [
   { icon: Home, title: "Dashboard", path: "/" },
   { icon: Phone, title: "Practice", path: "/practice" },
   { icon: Briefcase, title: "Items", path: "/items" },
 ]

 2.8 Regenerate API client

 Run cd frontend && npm run generate-client after backend endpoints are in place — auto-generates TypeScript types and service classes for the new endpoints.

 Checkpoint: Can select persona, start a voice call, talk to EVI, see live emotions, end call, and data is sent to backend.

 ---
 Phase 3: Post-Call Analysis & Coaching

 3.1 Speech metrics service

 Create: backend/app/services/speech_metrics.py

 Function analyze_speech_metrics(transcript: dict, duration_seconds: float) -> dict:
 - Words per minute — user word count / user speaking minutes (ideal: 130-160)
 - Filler words — detect "um", "uh", "like", "you know", "basically", "actually", etc. Return total, per-minute rate, and breakdown
 - Talk-listen ratio — user words / total words (ideal: 40-60% for discovery)
 - Longest monologue — longest consecutive user turn by word count
 - Questions asked — count user sentences ending in "?"

 3.2 Emotion summary service

 Create: backend/app/services/emotion_analysis.py

 Function summarize_emotions(emotion_data: dict) -> dict:
 - Takes raw EVI prosody scores (sent by frontend after call)
 - Computes averages for coaching-relevant dimensions: confidence, energy, hesitation
 - Identifies dominant emotions across the call
 - Builds a tone timeline (scores at intervals)

 3.3 Coaching report generator

 Create: backend/app/services/coaching_report.py

 Function generate_coaching_report(call_session_id: uuid.UUID) -> None (background task):
 1. Load CallSession from DB
 2. Run analyze_speech_metrics() on transcript
 3. Run summarize_emotions() on emotion_data
 4. Call OpenAI API (gpt-4o) with transcript + metrics as context, using a sales coach system prompt that requests:
   - Overall score (0-100)
   - Tone summary
   - Key moments with timestamps
   - Actionable recommendations
   - Strengths and areas for improvement
 5. Store complete report in CallSession.analysis_results JSON field
 6. Set status to "done"

 Creates its own DB session (using Session(engine)) since it runs as a background task outside the request lifecycle.

 Checkpoint: After ending a call, report generates within ~30 seconds and displays all metrics.

 ---
 Phase 4: Call History & Polish

 4.1 Call history page

 Create: frontend/src/routes/_layout/history.tsx

 - Fetches GET /api/v1/calls/ with pagination
 - Displays as a table using the existing DataTable component
 - Columns: Date, Persona, Duration, Score, Status
 - Click row to view the full coaching report

 4.2 Error handling

 Backend:
 - Hume token failure → 502 with descriptive error
 - Analysis failure → set status to "error", log exception
 - Ownership validation on all call endpoints (same pattern as items.py)

 Frontend:
 - Microphone permission denied → help dialog
 - EVI connection failure → retry button with error message
 - Analysis polling timeout (120s) → manual retry option
 - Network errors → toast notification via Sonner (already in stack)

 4.3 Environment variables

 Modify: .env

 Add:
 HUME_API_KEY=
 HUME_SECRET_KEY=
 HUME_CONFIG_ID=
 OPENAI_API_KEY=

 4.4 Docker compose

 Modify: docker-compose.yml — pass new env vars to backend service.

 4.5 Tests

 Create: backend/tests/test_calls.py

 Following existing test patterns:
 - test_create_call_session — POST returns 200 with session data
 - test_list_call_sessions — GET returns paginated list
 - test_complete_call_session — POST stores transcript/emotion data
 - test_get_report — GET returns report after analysis
 - test_ownership_enforcement — cannot access another user's sessions
 - Unit tests for speech_metrics and emotion_analysis services

 ---
 Files Summary

 Create
 ┌─────────────────────────────────────────────────────┬──────────────────────────────────────────┐
 │                        File                         │                 Purpose                  │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/api/routes/calls.py                     │ Call session CRUD + analysis trigger     │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/api/routes/hume.py                      │ Hume access token generation             │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/services/__init__.py                    │ Package init                             │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/services/sales_personas.py              │ AI prospect persona definitions          │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/services/speech_metrics.py              │ Transcript analysis (WPM, fillers, etc.) │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/services/emotion_analysis.py            │ Prosody score summarization              │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/app/services/coaching_report.py             │ Report orchestration + LLM feedback      │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ backend/tests/test_calls.py                         │ API and service tests                    │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ frontend/src/routes/_layout/practice.tsx            │ Practice call page                       │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ frontend/src/routes/_layout/history.tsx             │ Call history page                        │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ frontend/src/components/Practice/CallSetup.tsx      │ Persona selection UI                     │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ frontend/src/components/Practice/ActiveCall.tsx     │ EVI voice integration                    │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ frontend/src/components/Practice/EmotionDisplay.tsx │ Real-time emotion bars                   │
 ├─────────────────────────────────────────────────────┼──────────────────────────────────────────┤
 │ frontend/src/components/Practice/CoachingReport.tsx │ Report display                           │
 └─────────────────────────────────────────────────────┴──────────────────────────────────────────┘
 Modify
 ┌────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐
 │                      File                      │                              Change                               │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ backend/app/core/config.py                     │ Replace sales coach settings with HUME_SECRET_KEY, HUME_CONFIG_ID │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ backend/app/models.py                          │ Add CallSession model + all Pydantic schemas                      │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ backend/app/api/main.py                        │ Register calls and hume routers                                   │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ frontend/package.json                          │ Add @humeai/voice-react                                           │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ frontend/src/components/Sidebar/AppSidebar.tsx │ Add Practice nav item                                             │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ .env                                           │ Add Hume + OpenAI keys                                            │
 ├────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ docker-compose.yml                             │ Pass new env vars                                                 │
 └────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘
 ---
 Verification

 1. Backend API: Start server, create a call session via /api/v1/calls/, get a Hume token via /api/v1/hume/token, list personas
 2. Voice call: Open /practice, select persona, start call, speak, hear AI respond, see live emotion display
 3. Post-call: End call, see "analyzing" state, report loads with score + metrics + recommendations
 4. History: Navigate to call history, see past sessions, click to view reports
 5. Tests: Run pytest backend/tests/test_calls.py
