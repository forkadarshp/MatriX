"""Protobuf decoder for pipecat serialized frames."""

import json

from pipecat.frames.protobufs.frames_pb2 import Frame as FrameProto


def decode_protobuf(data: bytes) -> dict:
    """Decode serialized protobuf bytes into a readable dict.

    Returns a dict with at least a "type" key describing the content.
    """
    try:
        proto = FrameProto()
        proto.ParseFromString(data)
    except Exception:
        return {"type": "unknown", "size_bytes": len(data)}

    if proto.HasField("text"):
        return {"type": "text", "text": proto.text.text}

    if proto.HasField("transcription"):
        t = proto.transcription
        result: dict = {"type": "transcription", "text": t.text}
        if t.user_id:
            result["user_id"] = t.user_id
        return result

    if proto.HasField("audio"):
        a = proto.audio
        return {
            "type": "audio",
            "size_bytes": len(a.audio),
            "sample_rate": a.sample_rate,
        }

    if proto.HasField("message"):
        raw = proto.message.data
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            parsed = raw
        return {"type": "message", "data": parsed}

    return {"type": "empty", "size_bytes": len(data)}


class ProtobufMessageLog:
    """Lightweight session stats for decoded protobuf messages."""

    def __init__(self):
        self._counts: dict[str, int] = {"downstream": 0, "upstream": 0}
        self._bytes: dict[str, int] = {"downstream": 0, "upstream": 0}
        self._records: list[dict] = []

    def record(self, direction: str, size: int, decoded: dict):
        """Accumulate a decoded record.

        Args:
            direction: "downstream" or "upstream"
            size: raw byte size of the serialized frame
            decoded: dict returned by decode_protobuf()
        """
        self._counts[direction] = self._counts.get(direction, 0) + 1
        self._bytes[direction] = self._bytes.get(direction, 0) + size
        self._records.append({"direction": direction, "size": size, **decoded})

    def get_stats(self) -> dict:
        """Return counts and byte totals."""
        return {
            "downstream_count": self._counts.get("downstream", 0),
            "upstream_count": self._counts.get("upstream", 0),
            "downstream_bytes": self._bytes.get("downstream", 0),
            "upstream_bytes": self._bytes.get("upstream", 0),
            "total_messages": sum(self._counts.values()),
        }

    def clear(self):
        """Reset all stats."""
        self._counts = {"downstream": 0, "upstream": 0}
        self._bytes = {"downstream": 0, "upstream": 0}
        self._records.clear()
