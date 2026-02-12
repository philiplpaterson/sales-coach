import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser
from app.core.config import settings
from app.models import HumeTokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hume", tags=["hume"])

HUME_TOKEN_URL = "https://api.hume.ai/oauth2-cc/token"


@router.get("/token", response_model=HumeTokenResponse)
async def get_hume_token(current_user: CurrentUser) -> Any:
    """Get a short-lived Hume access token for the frontend EVI connection."""
    if not settings.HUME_API_KEY or not settings.HUME_SECRET_KEY:
        raise HTTPException(
            status_code=502,
            detail="Hume API credentials not configured",
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                HUME_TOKEN_URL,
                auth=(settings.HUME_API_KEY, settings.HUME_SECRET_KEY),
                data={"grant_type": "client_credentials"},
            )
    except httpx.HTTPError:
        logger.exception("Error communicating with Hume API")
        raise HTTPException(
            status_code=502,
            detail="Error communicating with Hume API",
        )

    if response.status_code != 200:
        logger.error(
            "Hume token request failed: %s %s",
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=502,
            detail="Failed to obtain Hume access token",
        )

    data = response.json()
    return HumeTokenResponse(
        access_token=data["access_token"],
        expires_in=data.get("expires_in", 600),
        config_id=settings.HUME_CONFIG_ID,
    )
