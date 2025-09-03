import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response


router = APIRouter(prefix="/api", tags=["files"])


@router.get("/audio/{filename}")
async def serve_audio(filename: str):
    audio_path = f"storage/audio/{filename}"
    if not os.path.exists(audio_path):
        # Fallback to vibevoice storage for pre-synthesized samples
        vv_path = f"storage/vibevoice/{filename}"
        if os.path.exists(vv_path):
            audio_path = vv_path
        else:
            raise HTTPException(status_code=404, detail="Audio file not found")
    mime = "audio/mpeg"
    if filename.lower().endswith(".wav"):
        mime = "audio/wav"
    with open(audio_path, "rb") as f:
        content = f.read()
    return Response(content=content, media_type=mime)


@router.get("/transcript/{filename}")
async def serve_transcript(filename: str):
    t_path = f"storage/transcripts/{filename}"
    if not os.path.exists(t_path):
        raise HTTPException(status_code=404, detail="Transcript file not found")
    with open(t_path, "r", encoding="utf-8") as f:
        content = f.read()
    return Response(content=content, media_type="text/plain; charset=utf-8")

@router.get("/vibevoice/files")
async def list_vibevoice_files():
    base_dir = "storage/vibevoice"
    try:
        if not os.path.isdir(base_dir):
            return {"files": []}
        files = []
        # Optional: load input mappings from JSON or CSV
        text_map = {}
        json_map_path = os.path.join(base_dir, "input_map.json")
        # Preferred: JSON map
        if os.path.exists(json_map_path):
            try:
                import json as _json
                with open(json_map_path, "r", encoding="utf-8") as jf:
                    data = _json.load(jf)
                if isinstance(data, dict):
                    # Expect keys to be filenames or case_### or indexes
                    text_map = {str(k): str(v) for k, v in data.items()}
            except Exception:
                text_map = {}
        for name in os.listdir(base_dir):
            if not name.lower().endswith((".wav", ".mp3")):
                continue
            path = os.path.join(base_dir, name)
            if os.path.isfile(path):
                try:
                    size = os.path.getsize(path)
                except Exception:
                    size = 0
                # Try map by exact filename, or by extracting index from filename like case_002_generated.wav
                mapped_text = None
                try:
                    mapped_text = text_map.get(name)
                    if mapped_text is None and name.lower().startswith("case_"):
                        import re as _re
                        m = _re.search(r"case_(\\d{3})_", name.lower())
                        if m:
                            idx = int(m.group(1))
                            mapped_text = text_map.get(str(idx)) or text_map.get(f"case_{idx:03d}_generated.wav")
                except Exception:
                    mapped_text = None
                files.append({"name": name, "size": size, "text": mapped_text})
        files.sort(key=lambda x: x["name"])
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list VibeVoice files: {e}")
