import time
import uuid
from typing import Any, Dict

import aiofiles
import httpx

from .base import VendorAdapter
from ..config import logger
from ..utils import validate_confidence


class ElevenLabsAdapter(VendorAdapter):
    """ElevenLabs TTS/STT adapter."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def synthesize(self, text: str, voice: str = "21m00Tcm4TlvDq8ikWAM", model_id: str = "eleven_flash_v2_5", **params) -> Dict[str, Any]:
        req_time = time.perf_counter()
        api_key = (self.api_key or "").strip()
        if not api_key or api_key.lower().startswith("dummy"):
            return {"status": "error", "error": "ElevenLabs API key not configured", "latency": time.perf_counter() - req_time}
        # Prefer HTTP/2 streaming for fairness with Deepgram; fallback to SDK if needed
        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream"
            headers = {"xi-api-key": self.api_key, "Content-Type": "application/json"}
            payload = {"text": text, "model_id": model_id}
            audio_filename = f"elevenlabs_{uuid.uuid4().hex}.mp3"
            audio_path = f"storage/audio/{audio_filename}"
            ttfb = None
            file_size = 0
            async with httpx.AsyncClient(http2=True) as client:
                logger.info(f"ElevenLabs TTS request: {url} with payload: {payload}")
                async with client.stream("POST", url, headers=headers, json=payload, timeout=60.0) as resp:
                    if resp.status_code != 200:
                        error_text = await resp.aread()
                        logger.error(f"ElevenLabs TTS error response: {resp.status_code} - {error_text.decode()}")
                        return {"status": "error", "error": f"HTTP {resp.status_code}: {error_text.decode()}", "latency": 0.0}
                    async with aiofiles.open(audio_path, 'wb') as f:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            if ttfb is None:
                                ttfb = time.perf_counter() - req_time
                            await f.write(chunk)
                            file_size += len(chunk)
            latency = time.perf_counter() - req_time
            ttfb_str = f"{ttfb:.3f}s" if ttfb is not None else "N/A"
            logger.info(f"ElevenLabs TTS API latency: {latency:.3f}s, TTFB: {ttfb_str} for text length: {len(text)}")
            return {
                "audio_path": audio_path,
                "vendor": "elevenlabs",
                "voice": voice,
                "latency": latency,
                "ttfb": ttfb,
                "status": "success",
                "metadata": {"model": model_id, "voice_id": voice, "file_size": file_size},
            }
        except Exception as http_error:
            logger.warning(f"ElevenLabs HTTP streaming failed, falling back to SDK: {http_error}")
            try:
                from elevenlabs import ElevenLabs  # type: ignore
                client = ElevenLabs(api_key=self.api_key)
                start_time = time.perf_counter()
                audio_generator = client.text_to_speech.convert(text=text, voice_id=voice, model_id=model_id)
                ttfb = None
                audio_filename = f"elevenlabs_{uuid.uuid4().hex}.mp3"
                audio_path = f"storage/audio/{audio_filename}"
                with open(audio_path, "wb") as f:
                    for chunk in audio_generator:
                        if ttfb is None:
                            ttfb = time.perf_counter() - start_time
                        f.write(chunk)
                latency = time.perf_counter() - start_time
                ttfb_str = f"{ttfb:.3f}s" if ttfb is not None else "N/A"
                logger.info(f"ElevenLabs TTS SDK latency: {latency:.3f}s, TTFB: {ttfb_str} for text length: {len(text)}")
                return {
                    "audio_path": audio_path,
                    "vendor": "elevenlabs",
                    "voice": voice,
                    "latency": latency,
                    "ttfb": ttfb,
                    "status": "success",
                    "metadata": {"model": model_id, "voice_id": voice},
                }
            except Exception as e:
                logger.error(f"ElevenLabs synthesis error: {e}")
                return {"status": "error", "error": str(e), "latency": 0.0}

    async def transcribe(self, audio_path: str, model_id: str = "scribe_v1", **params) -> Dict[str, Any]:
        req_time = time.perf_counter()
        api_key = (self.api_key or "").strip()
        if not api_key or api_key.lower().startswith("dummy"):
            return {"status": "error", "error": "ElevenLabs API key not configured", "latency": time.perf_counter() - req_time}
        try:
            from elevenlabs import ElevenLabs  # type: ignore
            client = ElevenLabs(api_key=self.api_key)
            with open(audio_path, 'rb') as audio_file:
                result = client.speech_to_text.convert(file=audio_file, model_id=model_id)
            transcript = result.text if hasattr(result, 'text') else str(result)
            confidence = validate_confidence(getattr(result, 'confidence', 0.95), "elevenlabs")
            return {
                "transcript": transcript,
                "confidence": confidence,
                "vendor": "elevenlabs",
                "latency": time.perf_counter() - req_time,
                "status": "success",
                "metadata": {"model": model_id},
            }
        except Exception as e:
            logger.error(f"ElevenLabs transcription error: {e}")
            return {"status": "error", "error": str(e), "latency": time.perf_counter() - req_time}


