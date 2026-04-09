"""State API routes. Thin wrappers for system state access, export, artifacts, and pipeline control."""

import json
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

import config
import artifact_store
import export_run
from core import hub
from core import agent_runtime
from core import orchestrator

def _emit(event_type, summary, data=None):
    """Emit an SSE event so the frontend refreshes."""
    agent_runtime.emit_event(event_type, agent_id=None, summary=summary, data=data)

router = APIRouter()


@router.get("/api/state")
def get_state():
    """Return full system state with resolved config limits."""
    state = agent_runtime.export_all()
    cfg = config.get()
    mode = cfg.get("model_mode", "dev")
    state["config_limits"] = {
        "max_turns": cfg.get("turn_limits", {}).get(mode, cfg.get("max_interview_turns", 15)),
        "max_personas": cfg.get("max_personas", {}).get(mode, 8),
        "max_interviewees": cfg.get("max_interviewees", {}).get(mode, 8),
        "mode": mode,
    }
    return state


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


# --- Artifacts ---

# Map frontend stage names to artifact_store stage names and hub output keys
_STAGE_MAP = {
    "briefs": {"hub_key": "brief", "next_phase": "persona_generation"},
    "personas": {"hub_key": "personas", "next_phase": "interviewing"},
    "strategies": {"hub_key": "interview_strategy", "next_phase": "interviewing"},
    "transcripts": {"hub_key": "transcripts", "next_phase": "synthesizing"},
    "syntheses": {"hub_key": "synthesis", "next_phase": "complete"},
    "visualizations": {"hub_key": "visualization", "next_phase": None},
}


@router.get("/api/artifacts/{stage}")
def list_artifacts(stage: str):
    """List all saved artifacts for a pipeline stage."""
    if stage not in _STAGE_MAP:
        return JSONResponse(status_code=400, content={"error": f"Unknown stage: {stage}"})
    return artifact_store.list_artifacts(stage)


@router.get("/api/artifacts/{stage}/{artifact_id}")
def get_artifact(stage: str, artifact_id: str):
    """Load a specific artifact's data."""
    data = artifact_store.load(stage, artifact_id)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "Artifact not found"})
    return data


@router.post("/api/artifacts/{stage}/upload")
def upload_artifact(stage: str, body: dict = Body(...)):
    """Upload an artifact for a stage. Saves to library and sets as current output."""
    if stage not in _STAGE_MAP:
        return JSONResponse(status_code=400, content={"error": f"Unknown stage: {stage}"})
    info = _STAGE_MAP[stage]
    hub.set_output(info["hub_key"], body)
    artifact_id = artifact_store.save(stage, body, label="Uploaded")
    next_phase = info.get("next_phase")
    if next_phase:
        hub.set_pending_phase(next_phase)
    _emit("artifact_loaded", f"Uploaded {stage} artifact", {"stage": stage, "artifact_id": artifact_id})
    return {"status": "uploaded", "stage": stage, "artifact_id": artifact_id, "pending_phase": next_phase}


@router.post("/api/artifacts/{stage}/select/{artifact_id}")
def select_artifact(stage: str, artifact_id: str):
    """Select a saved artifact as the current output for a stage."""
    if stage not in _STAGE_MAP:
        return JSONResponse(status_code=400, content={"error": f"Unknown stage: {stage}"})
    data = artifact_store.load(stage, artifact_id)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "Artifact not found"})
    info = _STAGE_MAP[stage]
    hub.set_output(info["hub_key"], data)
    next_phase = info.get("next_phase")
    if next_phase:
        hub.set_pending_phase(next_phase)
    _emit("artifact_loaded", f"Selected {stage} artifact", {"stage": stage, "artifact_id": artifact_id})
    return {"status": "selected", "stage": stage, "artifact_id": artifact_id, "pending_phase": next_phase}


@router.post("/api/proceed")
def proceed():
    """Clear the pipeline gate and advance to the pending phase."""
    pending = hub.get_pending_phase()
    if not pending:
        return JSONResponse(status_code=400, content={"error": "No pending phase transition"})
    orchestrator.resume()
    return {"status": "proceeded", "phase": hub.get_phase()}


# --- Export ---

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


@router.post("/api/export/run")
def export_run_folder():
    """Generate a complete run export folder with styled HTML files."""
    try:
        result = export_run.generate()
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
