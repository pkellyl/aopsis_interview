"""Chat API routes. Handles user ↔ context agent conversation and session lifecycle."""

import json
import re

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

import config
from core import hub, agent_runtime, orchestrator

router = APIRouter()

BRIEF_SIGNAL = "[BRIEF_COMPLETE]"


@router.post("/api/start")
def start_session():
    """Initialize a new session: create context agent, set phase, get opening message."""
    if hub.get_phase() != "idle":
        return JSONResponse(
            status_code=400,
            content={"error": "Session already active", "phase": hub.get_phase()}
        )

    hub.set_phase("context_gathering")
    prompt = config.load_prompt("context_agent")

    agent_runtime.create_agent(
        agent_id="context",
        agent_type="context",
        system_prompt=prompt,
        model_tier="balanced"
    )

    # Create orchestrator (watches events, drives all transitions)
    orchestrator.initialize()

    try:
        opening = agent_runtime.send_message(
            "context", "Hello, I'd like to begin the research briefing."
        )
        return {"status": "started", "phase": "context_gathering", "opening": opening}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/chat")
def chat(body: dict = Body(...)):
    """Send a user message to the context agent."""
    message = body.get("message", "").strip()
    if not message:
        return JSONResponse(status_code=400, content={"error": "Empty message"})

    agent = hub.get_agent("context")
    if agent is None:
        return JSONResponse(status_code=400, content={"error": "No context agent. Call /api/start first."})

    if agent["status"] != "active":
        return JSONResponse(status_code=400, content={"error": "Context agent is not active"})

    try:
        response = agent_runtime.send_message("context", message)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Check for brief completion signal
    brief = _extract_brief(response)
    if brief is not None:
        hub.set_output("brief", brief)
        hub.update_agent_status("context", "completed")
        agent_runtime.emit_event(
            "output_produced", "context",
            "Brief complete", {"type": "brief", "brief": brief}
        )

    return {"response": response, "brief_complete": brief is not None}


@router.post("/api/command")
def command(body: dict = Body(...)):
    """Send a user command to the orchestrator."""
    message = body.get("message", "").strip()
    if not message:
        return JSONResponse(status_code=400, content={"error": "Empty command"})

    agent_runtime.emit_event(
        "user_command", None,
        f"User command: {message}", {"command": message}
    )

    return {"status": "received", "message": message}


def _extract_brief(text):
    """Parse [BRIEF_COMPLETE] signal and extract JSON brief from response."""
    if BRIEF_SIGNAL not in text:
        return None

    after_signal = text.split(BRIEF_SIGNAL, 1)[1].strip()

    # Try to find JSON in the remaining text
    json_match = re.search(r'\{.*\}', after_signal, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # Try parsing the whole remainder
    try:
        return json.loads(after_signal)
    except (json.JSONDecodeError, ValueError):
        pass

    return None
