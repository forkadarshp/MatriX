"""Pipeline observer with professional ANSI logging via loguru."""

import asyncio
import json
import time
from typing import Optional

from loguru import logger
from pipecat.frames.frames import (
    Frame,
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
    OutputTransportMessageFrame,
)
from pipecat.observers.base_observer import BaseObserver, FramePushed
from pipecat.processors.frame_processor import FrameDirection
from pipecat.serializers.protobuf import ProtobufFrameSerializer

from pipecat_observability_plugin.observability_config import ObservabilityConfig
from pipecat_observability_plugin.protobuf_decoder import ProtobufMessageLog, decode_protobuf

# Map frame classes to short text tags
_FRAME_TAGS: dict[type, str] = {
    UserStartedSpeakingFrame: "USR-START",
    UserStoppedSpeakingFrame: "USR-STOP",
    BotStartedSpeakingFrame: "BOT-START",
    BotStoppedSpeakingFrame: "BOT-STOP",
    TranscriptionFrame: "STT",
    InterimTranscriptionFrame: "STT-PART",
    LLMTextFrame: "LLM",
    TextFrame: "TEXT",
    InputAudioRawFrame: "AUDIO-IN",
    OutputAudioRawFrame: "AUDIO-OUT",
    TTSStartedFrame: "TTS-START",
    TTSStoppedFrame: "TTS-STOP",
    LLMFullResponseStartFrame: "LLM-START",
    LLMFullResponseEndFrame: "LLM-END",
    StartFrame: "START",
    EndFrame: "END",
    CancelFrame: "CANCEL",
    OutputTransportMessageFrame: "MSG",
}


def _get_tag(frame: Frame) -> str:
    """Return the short text tag for a frame."""
    return _FRAME_TAGS.get(type(frame), type(frame).__name__[:10])


class PipelineObserver(BaseObserver):
    """Pipecat pipeline observer with decoded protobuf and loguru output."""

    def __init__(self, config: Optional[ObservabilityConfig] = None):
        super().__init__()
        self.config = config or ObservabilityConfig()
        self._protobuf_log = ProtobufMessageLog()
        self._serializer = ProtobufFrameSerializer()

        self._last_frame_time: Optional[float] = None
        self._frame_counts: dict[str, int] = {}
        self._latencies: dict[str, list[float]] = {}
        self._pending_tasks: set[asyncio.Task] = set()
        self._session_start: float = time.time()

    # ------------------------------------------------------------------
    # Processor name formatting
    # ------------------------------------------------------------------

    @staticmethod
    def _format_processor_name(name: str) -> str:
        """Shorten processor names for cleaner output."""
        name = name.replace("Service#0", "")
        name = name.replace("Transport#0", "")
        name = name.replace("Processor#0", "")
        name = name.replace("Aggregator#0", "")
        name = name.replace("#0", "")
        name = name.replace("FastAPIWebsocketInput", "WS-In")
        name = name.replace("FastAPIWebsocketOutput", "WS-Out")
        name = name.replace("Pipeline#0::", "")
        name = name.replace("PipelineTask#0::", "Task:")
        name = name.replace("Deepgram", "DG")
        name = name.replace("OpenAIAgent", "Agent")
        name = name.replace("LLMUser", "User")
        name = name.replace("LLMAssistant", "Asst")
        return name

    # ------------------------------------------------------------------
    # Content extraction
    # ------------------------------------------------------------------

    def _extract_content(self, frame: Frame) -> Optional[str]:
        """Extract displayable content from a frame."""
        if hasattr(frame, "text") and frame.text:
            text = frame.text
            limit = self.config.truncate_text_at
            if len(text) > limit:
                text = text[:limit] + "..."
            return f'"{text}"'

        if isinstance(frame, (InputAudioRawFrame, OutputAudioRawFrame)):
            if hasattr(frame, "audio") and frame.audio is not None:
                size_kb = len(frame.audio) / 1024
                rate = getattr(frame, "sample_rate", 0)
                return f"[{size_kb:.1f}KB @ {rate}Hz]"

        if hasattr(frame, "message") and isinstance(frame.message, dict):
            try:
                compact = json.dumps(frame.message, separators=(",", ":"))
                limit = self.config.truncate_text_at
                if len(compact) > limit:
                    compact = compact[:limit] + "..."
                return compact
            except (TypeError, ValueError):
                pass

        return None

    # ------------------------------------------------------------------
    # Background protobuf decode
    # ------------------------------------------------------------------

    async def _background_serialize_and_log(
        self, frame: Frame, direction_label: str
    ):
        """Serialize frame to protobuf and decode for stats. Non-blocking."""
        try:
            serialized = await self._serializer.serialize(frame)
            if serialized:
                decoded = decode_protobuf(serialized)
                self._protobuf_log.record(direction_label, len(serialized), decoded)
                logger.opt(ansi=True).trace(
                    "  protobuf: {}", decoded
                )
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Main hook
    # ------------------------------------------------------------------

    async def on_push_frame(self, data: FramePushed):
        if not self.config.enabled:
            return

        frame = data.frame
        frame_type = type(frame).__name__

        if not self.config.should_capture_frame(frame):
            return

        current_time = time.time()

        # Latency
        latency_ms: Optional[float] = None
        if self._last_frame_time is not None:
            latency_ms = (current_time - self._last_frame_time) * 1000
        self._last_frame_time = current_time

        if latency_ms is not None and self.config.enable_timing_metrics:
            self._latencies.setdefault(frame_type, []).append(latency_ms)

        # Frame counts
        self._frame_counts[frame_type] = self._frame_counts.get(frame_type, 0) + 1

        # Direction from FramePushed
        is_downstream = data.direction == FrameDirection.DOWNSTREAM
        is_upstream = data.direction == FrameDirection.UPSTREAM

        if is_downstream:
            arrow = "<green>>></green>"
            direction_label = "downstream"
        elif is_upstream:
            arrow = "<blue>&lt;&lt;</blue>"
            direction_label = "upstream"
        else:
            arrow = "<dim>--</dim>"
            direction_label = "control"

        # Source / destination
        source = self._format_processor_name(
            data.source.name if data.source else "?"
        )
        dest = self._format_processor_name(
            data.destination.name if data.destination else "?"
        )

        # Timestamp
        elapsed = current_time - self._session_start

        # Tag
        tag = _get_tag(frame)

        # Latency string
        lat_str = ""
        if latency_ms is not None and self.config.enable_timing_metrics:
            lat_str = f"{latency_ms:>6.1f}ms"

        # Content
        content = self._extract_content(frame)

        # Build log line
        line = (
            f"<dim>{elapsed:>7.2f}s</dim>  {arrow}  "
            f"[<bold>{tag:<9s}</bold>] {frame_type:<30s} "
            f"<dim>{source:>12s} -> {dest:<12s}</dim>"
        )
        if lat_str:
            line += f"  {lat_str}"

        if content:
            line += f"\n{'':>26s}{content}"

        logger.opt(ansi=True).debug(line)

        # Background protobuf decode
        if self.config.enable_binary_logging:
            task = asyncio.create_task(
                self._background_serialize_and_log(frame, direction_label)
            )
            self._pending_tasks.add(task)
            task.add_done_callback(self._pending_tasks.discard)

    # ------------------------------------------------------------------
    # Stats / summary
    # ------------------------------------------------------------------

    def get_frame_counts(self) -> dict[str, int]:
        return dict(self._frame_counts)

    def get_latency_stats(self) -> dict[str, dict]:
        stats = {}
        for ft, lats in self._latencies.items():
            if lats:
                stats[ft] = {
                    "count": len(lats),
                    "min_ms": min(lats),
                    "max_ms": max(lats),
                    "avg_ms": sum(lats) / len(lats),
                }
        return stats

    def get_summary(self) -> dict:
        return {
            "frame_counts": self.get_frame_counts(),
            "latency_stats": self.get_latency_stats(),
            "protobuf_stats": self._protobuf_log.get_stats(),
        }

    def print_summary(self):
        logger.opt(ansi=True).info("<bold>{'=' * 60}</bold>")
        logger.opt(ansi=True).info("<bold>Session Summary</bold>")
        logger.opt(ansi=True).info("<bold>{'=' * 60}</bold>")

        logger.info("Frame Counts:")
        for ft, count in sorted(self._frame_counts.items(), key=lambda x: -x[1]):
            logger.info(f"  {ft:<40s} {count:>6d}")

        if self._latencies:
            logger.info("Latency Stats:")
            for ft, lats in sorted(self._latencies.items()):
                if lats:
                    avg = sum(lats) / len(lats)
                    logger.info(
                        f"  {ft:<40s} avg: {avg:>6.1f}ms  "
                        f"min: {min(lats):>6.1f}ms  max: {max(lats):>6.1f}ms"
                    )

    def reset(self):
        self._last_frame_time = None
        self._frame_counts.clear()
        self._latencies.clear()
        self._protobuf_log.clear()
        self._session_start = time.time()
        for task in self._pending_tasks:
            task.cancel()
        self._pending_tasks.clear()
