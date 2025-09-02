import time
import torch
import torchaudio
import numpy as np
from typing import Any, Dict

from .base import VendorAdapter
from ..config import logger, debug_log


class OLMoASRAdapter(VendorAdapter):
    """OLMoASR STT adapter."""

    def __init__(self, model: str = "base"):
        self.model = model
        self.device = torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
        self._model_instance = None
        self._model_loaded = False
        self._current_model = None

    def _load_model(self, model: str = None):
        """Load the OLMoASR model if not already loaded or if model name changed."""
        if model is None:
            model = self.model
            
        if self._model_loaded and self._model_instance is not None and self._current_model == model:
            return
        
        try:
            from olmoasr import load_model
            logger.info(f"Loading OLMoASR model: {model} on device: {self.device}")
            self._model_instance = load_model(model, inference=True, device=self.device)
            self._model_loaded = True
            self._current_model = model
            logger.info("OLMoASR model loaded successfully!")
        except Exception as e:
            logger.error(f"Failed to load OLMoASR model: {e}")
            raise

    async def transcribe(self, audio_path: str, **params) -> Dict[str, Any]:
        req_time = time.perf_counter()
        
        try:
            # Get model from params or use default
            model = params.get("model", self.model)
            
            # Load model if not already loaded
            self._load_model(model)
            
            # Load and preprocess audio
            logger.info(f"Reading audio file: {audio_path}")
            waveform, samplerate = torchaudio.load(audio_path)
            logger.info(f"Audio shape: {waveform.shape}, Sample rate: {samplerate}") 

            # Convert stereo → mono
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)

            # Resample to 16kHz if needed
            target_sr = 16000
            if samplerate != target_sr:
                resampler = torchaudio.transforms.Resample(orig_freq=samplerate, new_freq=target_sr)
                waveform = resampler(waveform)

            # Convert to numpy float32 for OLMoASR
            waveform = waveform.squeeze().numpy().astype(np.float32)

            # # Ensure float32
            # waveform = waveform.astype(np.float32)

            # Run transcription
            logger.info("Running OLMoASR transcription...")
            result = self._model_instance.transcribe(waveform)
            
            transcript = result.get("text", "").strip()
            confidence = result.get("confidence", 0.0)
            
            # Validate confidence
            if confidence is None:
                confidence = 0.0
            else:
                try:
                    confidence = float(confidence)
                    if confidence < 0.0:
                        confidence = 0.0
                    elif confidence > 1.0:
                        if confidence >= 2.0 and confidence <= 100.0:
                            confidence = confidence / 100.0
                        else:
                            confidence = 1.0
                except (ValueError, TypeError):
                    confidence = 0.0

            latency = time.perf_counter() - req_time
            logger.info(f"OLMoASR transcription completed in {latency:.3f}s")
            
            return {
                "transcript": transcript,
                "confidence": confidence,
                "vendor": "olm_asr",
                "latency": latency,
                "status": "success",
                "metadata": {
                    "model": model,
                    "device": str(self.device),
                    "language": "en-US",  # OLMoASR is primarily English
                    "sample_rate": samplerate,
                    "audio_shape": waveform.shape
                },
            }
            
        except Exception as e:
            logger.error(f"OLMoASR transcription error: {e}")
            return {
                "status": "error", 
                "error": str(e), 
                "latency": time.perf_counter() - req_time
            }

    async def synthesize(self, text: str, **params) -> Dict[str, Any]:
        """OLMoASR is a speech recognition model, not synthesis."""
        return {
            "status": "error",
            "error": "OLMoASR is a speech recognition model and does not support text-to-speech synthesis",
            "latency": 0.0
        }
