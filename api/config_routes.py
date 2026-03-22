"""Config API routes. Thin wrappers over config module."""

from fastapi import APIRouter, Body

import config

router = APIRouter()


@router.get("/api/config")
def get_config():
    """Return current configuration."""
    return config.get()


@router.put("/api/config")
def update_config(data: dict = Body(...)):
    """Update configuration."""
    return config.update(data)
