"""SSE event streaming. Pushes system events to connected frontends."""

import asyncio
import json
import queue as queue_mod

from fastapi import APIRouter
from starlette.responses import StreamingResponse

router = APIRouter()

_queues: list[queue_mod.Queue] = []


def broadcast(event: dict):
    """Broadcast event to all SSE clients. Thread-safe."""
    for q in list(_queues):
        try:
            q.put_nowait(event)
        except queue_mod.Full:
            pass


@router.get("/api/events")
async def event_stream():
    """SSE endpoint for real-time event streaming."""
    q = queue_mod.Queue(maxsize=1000)
    _queues.append(q)

    async def generate():
        try:
            keepalive = 0
            while True:
                try:
                    event = q.get_nowait()
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                    keepalive = 0
                except queue_mod.Empty:
                    await asyncio.sleep(0.1)
                    keepalive += 1
                    if keepalive >= 300:
                        yield ": keepalive\n\n"
                        keepalive = 0
        except asyncio.CancelledError:
            pass
        finally:
            if q in _queues:
                _queues.remove(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )
