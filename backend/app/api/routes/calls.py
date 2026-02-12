import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    CallSession,
    CallSessionComplete,
    CallSessionCreate,
    CallSessionPublic,
    CallSessionsPublic,
    CoachingReportPublic,
    Message,
)
from app.services.coaching_report import generate_coaching_report
from app.services.sales_personas import get_personas_list

router = APIRouter(prefix="/calls", tags=["calls"])


@router.post("/", response_model=CallSessionPublic)
def create_call_session(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    call_in: CallSessionCreate,
) -> Any:
    """Create a new call session."""
    call = CallSession.model_validate(
        call_in, update={"owner_id": current_user.id}
    )
    session.add(call)
    session.commit()
    session.refresh(call)
    return call


@router.get("/", response_model=CallSessionsPublic)
def list_call_sessions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """List user's call sessions, newest first."""
    count_statement = (
        select(func.count())
        .select_from(CallSession)
        .where(CallSession.owner_id == current_user.id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(CallSession)
        .where(CallSession.owner_id == current_user.id)
        .order_by(CallSession.created_at.desc())  # type: ignore[union-attr]
        .offset(skip)
        .limit(limit)
    )
    calls = session.exec(statement).all()
    return CallSessionsPublic(data=calls, count=count)


@router.get("/personas/list")
def list_personas() -> Any:
    """List available sales personas."""
    return get_personas_list()


@router.get("/{call_id}", response_model=CallSessionPublic)
def get_call_session(
    session: SessionDep, current_user: CurrentUser, call_id: uuid.UUID
) -> Any:
    """Get a single call session."""
    call = session.get(CallSession, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call session not found")
    if not current_user.is_superuser and call.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return call


@router.post("/{call_id}/complete", response_model=CallSessionPublic)
def complete_call_session(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    call_id: uuid.UUID,
    data: CallSessionComplete,
) -> Any:
    """Store transcript + emotion data after call ends."""
    call = session.get(CallSession, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call session not found")
    if call.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")

    call.duration_seconds = data.duration_seconds
    call.transcript = data.transcript
    call.emotion_data = data.emotion_data
    call.hume_chat_id = data.hume_chat_id
    call.ended_at = datetime.utcnow()
    call.status = "completed"
    session.add(call)
    session.commit()
    session.refresh(call)
    return call


@router.post("/{call_id}/analyze", response_model=Message)
def analyze_call_session(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    call_id: uuid.UUID,
    background_tasks: BackgroundTasks,
) -> Any:
    """Trigger background coaching report generation."""
    call = session.get(CallSession, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call session not found")
    if call.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    if call.status not in ("completed", "error"):
        raise HTTPException(
            status_code=400,
            detail=f"Call must be completed before analysis. Current status: {call.status}",
        )

    background_tasks.add_task(generate_coaching_report, call.id)
    return Message(message="Analysis started")


@router.get("/{call_id}/report", response_model=CoachingReportPublic)
def get_call_report(
    session: SessionDep, current_user: CurrentUser, call_id: uuid.UUID
) -> Any:
    """Get the coaching report for a call session."""
    call = session.get(CallSession, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call session not found")
    if not current_user.is_superuser and call.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    if call.status in ("active", "completed", "analyzing"):
        raise HTTPException(status_code=202, detail="Analysis in progress")
    if call.status == "error":
        error_msg = (call.analysis_results or {}).get("error", "Analysis failed")
        raise HTTPException(status_code=422, detail=error_msg)
    if not call.analysis_results:
        raise HTTPException(status_code=404, detail="Report not found")

    return CoachingReportPublic(**call.analysis_results, transcript=call.transcript)


@router.delete("/{call_id}")
def delete_call_session(
    session: SessionDep, current_user: CurrentUser, call_id: uuid.UUID
) -> Message:
    """Delete a call session."""
    call = session.get(CallSession, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call session not found")
    if not current_user.is_superuser and call.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    session.delete(call)
    session.commit()
    return Message(message="Call session deleted successfully")
