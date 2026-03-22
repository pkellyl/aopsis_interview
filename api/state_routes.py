"""State API routes. Thin wrappers for system state access and export."""

import json
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core import hub
from core import agent_runtime

router = APIRouter()


@router.get("/api/state")
def get_state():
    """Return full system state."""
    return agent_runtime.export_all()


@router.get("/api/agents")
def get_agents():
    """Return all agents."""
    return hub.get_all_agents()


@router.get("/api/agents/{agent_id}")
def get_agent(agent_id: str):
    """Return a single agent's state."""
    agent = agent_runtime.export_agent(agent_id)
    if agent is None:
        return JSONResponse(status_code=404, content={"error": "Agent not found"})
    return agent


@router.post("/api/reset")
def reset_state():
    """Reset system to initial state."""
    hub.reset()
    return {"status": "reset", "phase": hub.get_phase()}


@router.get("/api/export/full")
def export_full():
    """Export entire system state as JSON."""
    return agent_runtime.export_all()


@router.get("/api/export/personas")
def export_personas():
    """Export personas as JSON."""
    outputs = hub.get_outputs()
    personas = outputs.get("personas")
    if not personas:
        return JSONResponse(status_code=404, content={"error": "No personas generated yet"})
    return personas


@router.get("/api/export/transcripts")
def export_transcripts():
    """Export all transcripts as JSON."""
    outputs = hub.get_outputs()
    transcripts = outputs.get("transcripts", [])
    if not transcripts:
        return JSONResponse(status_code=404, content={"error": "No transcripts yet"})
    return transcripts


@router.get("/api/export/transcript/{persona_id}")
def export_transcript(persona_id: str):
    """Export a single transcript by persona ID or name."""
    outputs = hub.get_outputs()
    for t in outputs.get("transcripts", []):
        if t.get("persona_id") == persona_id or t.get("persona_name") == persona_id:
            return t
    return JSONResponse(status_code=404, content={"error": f"Transcript not found: {persona_id}"})
