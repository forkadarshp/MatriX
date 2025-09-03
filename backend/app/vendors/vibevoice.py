import csv
import json
import os
import re
import time
from typing import Any, Dict, Optional

from .base import VendorAdapter
from ..config import logger, debug_log
from ..utils import get_audio_duration


class VibeVoiceAdapter(VendorAdapter):
    """Adapter for using pre-synthesized VibeVoice audio samples as TTS output.

    This adapter does not generate audio. Instead, it returns an existing
    audio file path based on configuration. This enables running the usual
    TTS->STT evaluation flow while skipping synthesis.

    Configuration (provided via runs.config_json.models.vibevoice):
    - audio_map: Dict[str, str] mapping exact input text -> audio file path
    - mapping_file: Path to a JSON file containing the same mapping structure
    - audio_dir: Base directory for audio files (optional, used for logging/fallback)
    - audio_path: Direct path override (applies for all items if provided)
    """

    def __init__(self) -> None:
        self._loaded_mapping_path: Optional[str] = None
        self._audio_map: Dict[str, str] = {}
        self._latency_map: Dict[str, float] = {}
        self._load_latency_log()

    def _load_latency_log(self, log_path: str = "storage/vibevoice/latency_log.csv"):
        """Load the pre-recorded latency values from the CSV log."""
        if not os.path.exists(log_path):
            logger.warning(f"VibeVoice latency log not found at: {log_path}")
            return
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                next(reader)  # Skip header
                for row in reader:
                    if len(row) >= 2:
                        filename, latency_str = row
                        # Key on case number, e.g., "036" from "case_036.txt"
                        match = re.search(r"case_(\d+)", filename)
                        if match:
                            case_num = match.group(1).zfill(3)
                            self._latency_map[case_num] = float(latency_str)
            logger.info(f"VibeVoice latency log loaded with {len(self._latency_map)} entries.")
        except Exception as e:
            logger.error(f"Failed to load VibeVoice latency log '{log_path}': {e}")

    def _load_mapping_file(self, mapping_file: Optional[str]) -> None:
        if not mapping_file:
            return
        try:
            abs_path = os.path.abspath(mapping_file)
            if self._loaded_mapping_path == abs_path:
                return
            with open(abs_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                # Expect { "text": "path", ... }
                self._audio_map = {str(k): str(v) for k, v in data.items()}
                self._loaded_mapping_path = abs_path
                logger.info(f"VibeVoice mapping file loaded: {abs_path} with {len(self._audio_map)} entries")
            else:
                logger.error("VibeVoice mapping file must contain a JSON object of text->path")
        except Exception as e:
            logger.error(f"Failed to load VibeVoice mapping file '{mapping_file}': {e}")

    def _get_predefined_latency(self, audio_path: str) -> Optional[float]:
        """Check for a pre-defined latency from the log file based on the audio path."""
        filename = os.path.basename(audio_path)
        match = re.search(r"case_(\d+)", filename)
        if match:
            case_num = match.group(1)
            return self._latency_map.get(case_num)
        return None

    def _resolve_audio_path(self, text: str, params: Dict[str, Any]) -> Optional[str]:
        # 1) Direct override
        override_path = params.get("audio_path")
        if override_path and os.path.exists(override_path):
            return override_path

        # 2) Merge provided audio_map into cache (does not clear previously loaded file mapping)
        provided_map = params.get("audio_map") or {}
        if isinstance(provided_map, dict):
            # Merge but do not overwrite file-loaded entries
            for k, v in provided_map.items():
                self._audio_map.setdefault(str(k), str(v))

        # 3) Load mapping_file if given
        self._load_mapping_file(params.get("mapping_file"))

        # 4) Lookup by exact text
        if text in self._audio_map:
            candidate = self._audio_map[text]
            if os.path.isabs(candidate):
                if os.path.exists(candidate):
                    return candidate
            else:
                # If relative, try relative as-is, and also try under audio_dir if provided
                if os.path.exists(candidate):
                    return candidate
                audio_dir = params.get("audio_dir")
                if audio_dir:
                    joined = os.path.join(audio_dir, candidate)
                    if os.path.exists(joined):
                        return joined

        # 5) No mapping found; give up with an informative error
        logger.error("VibeVoice could not resolve audio path for provided text. "
                     "Ensure 'audio_map' or 'mapping_file' includes an entry for the text.")
        return None

    async def synthesize(self, text: str, voice: str = "vibevoice", **params) -> Dict[str, Any]:
        req_time = time.perf_counter()
        try:
            audio_path = self._resolve_audio_path(text, params)
            if not audio_path:
                return {
                    "status": "error",
                    "error": "No audio path could be resolved for the given text",
                    "latency": time.perf_counter() - req_time,
                }
            
            # Get pre-defined latency and actual audio duration
            latency = self._get_predefined_latency(audio_path)
            duration = get_audio_duration(audio_path) if os.path.exists(audio_path) else 0.0

            try:
                file_size = os.path.getsize(audio_path)
            except Exception:
                file_size = 0

            # If latency is not found, it remains None, and won't be included in metrics
            if latency is None:
                 debug_log(f"VibeVoice latency not found for {audio_path}. Latency and RTF will be blank.")


            debug_log(f"VibeVoice using pre-synth audio: {audio_path} (size={file_size} bytes)")
            return {
                "audio_path": audio_path,
                "vendor": "vibevoice",
                "voice": voice,
                "latency": latency,
                "ttfb": None,
                "status": "success",
                "duration": duration,
                "metadata": {
                    "model": "pre_synthesized",
                    "voice_id": voice,
                    "file_size": file_size,
                },
            }
        except Exception as e:
            logger.error(f"VibeVoice synthesize error: {e}")
            return {"status": "error", "error": str(e), "latency": time.perf_counter() - req_time}

    async def transcribe(self, audio_path: str, **params) -> Dict[str, Any]:
        # Not supported by this adapter. Use another STT adapter instead.
        return {"status": "error", "error": "VibeVoice does not provide STT", "latency": 0.0}


