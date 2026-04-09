"""Synthetic Audience Interview System. FastAPI entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import config
from core import hub
from core import agent_runtime
from api import config_routes, state_routes, chat_routes, events

load_dotenv()


@asynccontextmanager
async def lifespan(app):
    """Initialize config and state on server start."""
    config.load()
    hub.load()
    yield


app = FastAPI(title="Interview Synth", version="0.1.0", lifespan=lifespan)

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

# Wire SSE broadcast to agent runtime events
agent_runtime.subscribe(events.broadcast)




@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "phase": hub.get_phase(),
        "agent_count": len(hub.get_all_agents()),
        "has_api_key": bool(config.get_api_key())
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
