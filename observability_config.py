"""Configuration for pipeline observability."""

from dataclasses import dataclass

from pipecat.frames.frames import (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    TextFrame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
    LLMTextFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    LLMFullResponseStartFrame,
    LLMFullResponseEndFrame,
    StartFrame,
    EndFrame,
    CancelFrame,
)

# Frame classes gated by audio capture
_AUDIO_FRAMES = (InputAudioRawFrame, OutputAudioRawFrame)

# Frame classes gated by text capture
_TEXT_FRAMES = (TextFrame, TranscriptionFrame, InterimTranscriptionFrame, LLMTextFrame)


@dataclass
class ObservabilityConfig:
    """Configuration for pipeline observability features."""

    enabled: bool = True
    enable_binary_logging: bool = True
    enable_audio_capture: bool = False
    enable_text_capture: bool = True
    enable_timing_metrics: bool = True
    truncate_text_at: int = 80

    def should_capture_frame(self, frame) -> bool:
        """Check if a frame should be captured based on current settings."""
        if not self.enabled:
            return False
        if isinstance(frame, _AUDIO_FRAMES) and not self.enable_audio_capture:
            return False
        if isinstance(frame, _TEXT_FRAMES) and not self.enable_text_capture:
            return False
        return True
