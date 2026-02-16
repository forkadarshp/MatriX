# pipecat-observability-plugin

Drop-in pipeline observer for [pipecat](https://github.com/pipecat-ai/pipecat) projects. Provides color-coded, aligned log output with decoded protobuf content via loguru.

## What it does

- Observes every frame flowing through a pipecat pipeline
- Logs direction (`>>` downstream, `<<` upstream, `--` control) with loguru ANSI colors
- Decodes protobuf-serialized frames into readable dicts (text, transcription, audio stats, JSON messages)
- Tracks per-frame-type counts, latency stats, and protobuf byte totals
- Runs serialization/decode in background `asyncio` tasks to avoid blocking audio

## Files

```
pipecat_observability_plugin/
    __init__.py                 # Public API
    observability_config.py     # ObservabilityConfig dataclass
    protobuf_decoder.py         # decode_protobuf() + ProtobufMessageLog
    pipeline_observer.py        # PipelineObserver (BaseObserver subclass)
```

## Requirements

- `pipecat-ai` (tested with 0.0.101)
- `loguru`

## Setup

1. Copy the `pipecat_observability_plugin/` folder into your project root (next to your `bot.py` or equivalent).

2. Install dependencies if not already present:

```bash
pip install pipecat-ai loguru
# or with uv:
uv add pipecat-ai loguru
```

3. Import and attach to your pipeline task:

```python
from pipecat_observability_plugin import PipelineObserver, ObservabilityConfig

config = ObservabilityConfig(
    enabled=True,
    enable_binary_logging=True,
    enable_audio_capture=False,   # True = log every audio frame (high volume)
    enable_text_capture=True,
    enable_timing_metrics=True,
    truncate_text_at=80,
)
observer = PipelineObserver(config=config)

task = PipelineTask(
    pipeline,
    params=PipelineParams(allow_interruptions=True, enable_metrics=True),
    observers=[RTVIObserver(rtvi), observer],  # add observer here
)
```

4. Make sure loguru is configured at DEBUG level (the observer logs at `debug`; protobuf decode detail at `trace`):

```python
import sys
from loguru import logger

logger.remove(0)
logger.add(sys.stderr, level="DEBUG")
```

## Log output

```
   3.42s  >>  [STT      ] TranscriptionFrame           DG-STT -> UserAggr      12.3ms
                          "Hello how are you"
   3.55s  <<  [LLM      ] LLMTextFrame                 Agent  -> DG-TTS         8.1ms
                          "I'm doing well, thanks"
   4.01s  >>  [AUDIO-IN ] InputAudioRawFrame            WS-In  -> DG-STT       [3.2KB @ 16000Hz]
   4.02s  --  [START    ] StartFrame                    Task:Src -> RTVI
```

- `>>` green = downstream
- `<<` blue = upstream
- `--` dim = control/other

## Configuration reference

| Field                  | Type   | Default | Description                                |
|------------------------|--------|---------|--------------------------------------------|
| `enabled`              | `bool` | `True`  | Master on/off switch                       |
| `enable_binary_logging`| `bool` | `True`  | Background protobuf serialize + decode     |
| `enable_audio_capture` | `bool` | `False` | Log audio frames (high volume when on)     |
| `enable_text_capture`  | `bool` | `True`  | Log text/transcription/LLM frames          |
| `enable_timing_metrics`| `bool` | `True`  | Track inter-frame latency                  |
| `truncate_text_at`     | `int`  | `80`    | Max chars before truncating text content   |

## API

```python
observer.get_frame_counts()   # -> dict[str, int]
observer.get_latency_stats()  # -> dict[str, {count, min_ms, max_ms, avg_ms}]
observer.get_summary()        # -> {frame_counts, latency_stats, protobuf_stats}
observer.print_summary()      # logs a formatted summary via loguru
observer.reset()              # clears all counters and cancels pending tasks
```
