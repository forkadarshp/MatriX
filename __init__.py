"""Pipecat observability plugin — drop-in pipeline observer with decoded protobuf logging."""

from pipecat_observability_plugin.observability_config import ObservabilityConfig
from pipecat_observability_plugin.protobuf_decoder import decode_protobuf, ProtobufMessageLog
from pipecat_observability_plugin.pipeline_observer import PipelineObserver

__all__ = [
    "ObservabilityConfig",
    "decode_protobuf",
    "ProtobufMessageLog",
    "PipelineObserver",
]
