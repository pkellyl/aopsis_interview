"""Synthetic Audience Interview System. FastAPI entry point."""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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


# Serve built frontend (Vite output in dist/)
DIST = Path(__file__).parent / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(request: Request, path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        file = DIST / path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(DIST / "index.html")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
