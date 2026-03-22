"""Synthetic Audience Interview System. FastAPI entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import config
from core import hub
from core import agent_runtime
from core import orchestrator
from api import config_routes, state_routes, chat_routes, events

load_dotenv()

app = FastAPI(title="Interview Synth", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_routes.router)
app.include_router(state_routes.router)
app.include_router(chat_routes.router)
app.include_router(events.router)

# Wire SSE broadcast and orchestrator to agent runtime events
agent_runtime.subscribe(events.broadcast)
agent_runtime.subscribe(orchestrator.enqueue)


@app.on_event("startup")
def startup():
    """Initialize config and state on server start."""
    config.load()
    hub.load()


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "phase": hub.get_phase(),
        "agent_count": len(hub.get_all_agents()),
        "has_api_key": bool(config.get_api_key())
    }
