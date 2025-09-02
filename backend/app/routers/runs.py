import json
import csv
from io import StringIO, BytesIO
import uuid
from typing import Any, Dict, List, Optional
import pandas as pd
import base64

from fastapi import APIRouter, Form, HTTPException

from ..db import get_db_connection, dict_factory
from ..config import logger
from ..models import RunCreate
from ..services.runs_service import process_isolated_mode, process_chained_mode


router = APIRouter(prefix="/api", tags=["runs"])


@router.post("/runs")
async def create_run(run_data: RunCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        run_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO runs (id, project_id, mode, vendor_list_json, config_json, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            (
                run_id,
                run_data.project_id,
                run_data.mode,
                json.dumps(run_data.vendors),
                json.dumps(run_data.config),
            ),
        )
        test_inputs: List[Dict[str, Any]] = []

        def _add_text(text: Optional[str], result_id: Optional[str] = None, metric_type: Optional[str] = None):
            if text is None:
                return
            t = str(text).strip()
            if t:
                test_inputs.append({
                    "text": t, 
                    "script_item_id": None,
                    "result_id": result_id,
                    "metric_type": metric_type
                })

        def _parse_batch_input(raw: Optional[str], fmt: Optional[str]) -> None:
            if not raw:
                return
            format_lower = (fmt or "txt").lower()
            if format_lower == "jsonl":
                for line in StringIO(raw):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        _add_text(obj.get("text") or obj.get("prompt") or obj.get("sentence"))
                    except Exception:
                        # Skip malformed lines
                        continue
            elif format_lower == "csv":
                try:
                    sample = raw[:1024]
                    try:
                        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
                    except Exception:
                        dialect = csv.excel_tab if "\t" in sample else csv.excel
                    reader = csv.DictReader(StringIO(raw), dialect=dialect)
                    for row in reader:
                        if not row:
                            continue
                        # Check for batch mode columns: Result ID, Metric, Input (case-insensitive)
                        text = (
                            row.get("Input") or row.get("input") or row.get("text") or row.get("prompt") or row.get("sentence")
                        )
                        result_id = (
                            row.get("Result ID") or row.get("result_id") or row.get("result id") or row.get("id")
                        )
                        metric_type = (
                            row.get("Metric") or row.get("metric") or row.get("metric_type") or row.get("metric type")
                        )
                        _add_text(text, result_id, metric_type)
                except Exception:
                    # Fallback: treat as plain text if CSV parsing fails
                    for line in StringIO(raw):
                        _add_text(line)
            elif format_lower == "xlsx":
                # Support both raw base64 string and data URL prefix
                df = None
                raw_str = str(raw)
                # Helper to add rows from DataFrame and return count
                def _append_rows_from_df(frame: pd.DataFrame) -> int:
                    normalized_cols = {str(c).strip().lower(): c for c in frame.columns}
                    def pick(colnames: List[str], row: pd.Series) -> Optional[str]:
                        for name in colnames:
                            key = name.lower()
                            if key in normalized_cols:
                                value = row.get(normalized_cols[key])
                                if pd.notna(value):
                                    return str(value)
                        return None
                    added = 0
                    for _, r in frame.iterrows():
                        text_val = pick(["Input", "text", "prompt", "sentence"], r)
                        if not text_val:
                            continue
                        result_id_val = pick(["Result ID", "result_id", "result id", "id"], r)
                        metric_type_val = pick(["Metric", "metric", "metric_type", "metric type"], r)
                        _add_text(text_val, result_id_val, metric_type_val)
                        added += 1
                    return added

                try:
                    # Strip data URL if present and pad base64 if needed
                    base64_part = raw_str.split(",", 1)[1] if raw_str.startswith("data:") else raw_str
                    b64 = base64_part.strip()
                    missing = (-len(b64)) % 4
                    if missing:
                        b64 += "=" * missing
                    excel_bytes = base64.b64decode(b64)
                    if not excel_bytes.startswith(b"PK"):
                        raise ValueError("Not a zip file (xlsx)")
                    df = pd.read_excel(BytesIO(excel_bytes), engine='openpyxl')
                    logger.info(f"Parsed XLSX: rows={len(df)} cols={list(df.columns)}")
                except Exception as e:
                    logger.error(f"Failed to decode XLSX base64: {e}")
                    df = None
                if df is None:
                    # Fallback: user may have pasted table text (CSV/TSV) while selecting XLSX.
                    try:
                        sample = raw_str[:2048]
                        try:
                            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
                        except Exception:
                            dialect = csv.excel_tab if "\t" in sample else csv.excel
                        reader = csv.DictReader(StringIO(raw_str), dialect=dialect)
                        added = 0
                        for row in reader:
                            if not row:
                                continue
                            text = (
                                row.get("Input") or row.get("input") or row.get("text") or row.get("prompt") or row.get("sentence")
                            )
                            result_id = (
                                row.get("Result ID") or row.get("result_id") or row.get("result id") or row.get("id")
                            )
                            metric_type = (
                                row.get("Metric") or row.get("metric") or row.get("metric_type") or row.get("metric type")
                            )
                            if text and str(text).strip():
                                _add_text(text, result_id, metric_type)
                                added += 1
                        if added == 0:
                            raise ValueError("No rows parsed from CSV/TSV fallback")
                        logger.info(f"Parsed CSV/TSV fallback: rows={added}")
                        return
                    except Exception as e:
                        logger.error(f"Invalid XLSX payload and CSV/TSV fallback failed: {e}")
                        raise HTTPException(status_code=400, detail="Invalid XLSX payload. Expected base64-encoded Excel content or a pasted CSV/TSV table.")
                # Append rows from real Excel file
                added_rows = _append_rows_from_df(df)
                if added_rows == 0:
                    raise HTTPException(status_code=400, detail="XLSX parsed but no rows found. Expected columns: Result ID, Metric, Input.")
            else:  # txt
                # If user pasted a table (CSV/TSV) or a base64 XLSX, handle accordingly
                raw_str = str(raw)
                sample = raw_str[:2048]
                handled_special = False
                # Try CSV/TSV if header hints are present
                if ("Result ID" in sample or "Metric" in sample or "Input" in sample) and ("," in sample or "\t" in sample or ";" in sample or "|" in sample):
                    try:
                        try:
                            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
                        except Exception:
                            dialect = csv.excel_tab if "\t" in sample else csv.excel
                        reader = csv.DictReader(StringIO(raw_str), dialect=dialect)
                        for row in reader:
                            if not row:
                                continue
                            text = (
                                row.get("Input") or row.get("input") or row.get("text") or row.get("prompt") or row.get("sentence")
                            )
                            result_id = (
                                row.get("Result ID") or row.get("result_id") or row.get("result id") or row.get("id")
                            )
                            metric_type = (
                                row.get("Metric") or row.get("metric") or row.get("metric_type") or row.get("metric type")
                            )
                            _add_text(text, result_id, metric_type)
                        handled_special = True
                    except Exception:
                        handled_special = False
                # Try XLSX base64 heuristic (zip base64 usually starts with 'UEsDB')
                if not handled_special:
                    try:
                        probable_b64 = raw_str.strip().split(",", 1)[1] if raw_str.startswith("data:") else raw_str.strip()
                        # Pad base64 if needed
                        missing = (-len(probable_b64)) % 4
                        if missing:
                            probable_b64 += "=" * missing
                        excel_bytes = base64.b64decode(probable_b64)
                        if excel_bytes[:2] == b"PK":
                            df = pd.read_excel(BytesIO(excel_bytes), engine='openpyxl')
                            normalized_cols = {str(c).strip().lower(): c for c in df.columns}
                            def pick(colnames: List[str], row: pd.Series) -> Optional[str]:
                                for name in colnames:
                                    key = name.lower()
                                    if key in normalized_cols:
                                        value = row.get(normalized_cols[key])
                                        if pd.notna(value):
                                            return str(value)
                                return None
                            for _, r in df.iterrows():
                                text_val = pick(["Input", "text", "prompt", "sentence"], r)
                                if not text_val:
                                    continue
                                result_id_val = pick(["Result ID", "result_id", "result id", "id"], r)
                                metric_type_val = pick(["Metric", "metric", "metric_type", "metric type"], r)
                                _add_text(text_val, result_id_val, metric_type_val)
                            handled_special = True
                    except Exception:
                        handled_special = handled_special or False
                if not handled_special:
                    for line in StringIO(raw_str):
                        _add_text(line)
        if run_data.text_inputs:
            for text in run_data.text_inputs:
                test_inputs.append({"text": text, "script_item_id": None, "result_id": None, "metric_type": None})
        # Direct batch items array
        if getattr(run_data, "batch_script_items", None):
            for item in (run_data.batch_script_items or []):
                try:
                    # item can be dict or model; support both
                    txt = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
                    _add_text(txt)
                except Exception:
                    continue
        # Raw batch input string with format
        if getattr(run_data, "batch_script_input", None):
            _parse_batch_input(run_data.batch_script_input, getattr(run_data, "batch_script_format", None))
        if run_data.script_ids:
            for script_id in run_data.script_ids:
                cursor.execute("SELECT * FROM script_items WHERE script_id = ?", (script_id,))
                items = cursor.fetchall()
                for item in items:
                    test_inputs.append({"text": item[2], "script_item_id": item[0]})
        if not test_inputs:
            test_inputs = [{"text": "Hello world, this is a test.", "script_item_id": None}]
        mode_lower = (run_data.mode or "isolated").lower()
        cfg = run_data.config or {}
        chain = cfg.get("chain") or {}
        tts_vendor = (chain.get("tts_vendor") or "elevenlabs").lower()
        stt_vendor = (chain.get("stt_vendor") or "deepgram").lower()
        combined_label = f"{tts_vendor}→{stt_vendor}"
        if mode_lower == "chained":
            for test_input in test_inputs:
                item_id = str(uuid.uuid4())
                cursor.execute(
                    """
                    INSERT INTO run_items (id, run_id, script_item_id, vendor, text_input, result_id, metric_type, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                    """,
                    (
                        item_id,
                        run_id,
                        test_input["script_item_id"],
                        combined_label,
                        test_input["text"],
                        test_input.get("result_id"),
                        test_input.get("metric_type"),
                    ),
                )
            cursor.execute("UPDATE runs SET vendor_list_json = ? WHERE id = ?", (json.dumps([combined_label]), run_id))
        else:
            for vendor in run_data.vendors:
                for test_input in test_inputs:
                    item_id = str(uuid.uuid4())
                    cursor.execute(
                        """
                        INSERT INTO run_items (id, run_id, script_item_id, vendor, text_input, result_id, metric_type, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                        """,
                        (
                            item_id,
                            run_id,
                            test_input["script_item_id"],
                            vendor,
                            test_input["text"],
                            test_input.get("result_id"),
                            test_input.get("metric_type"),
                        ),
                    )
        conn.commit()
        import asyncio as _asyncio

        _asyncio.create_task(process_run(run_id))
        return {"run_id": run_id, "status": "created", "message": "Run created and processing started"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create run: {str(e)}")
    finally:
        conn.close()


async def process_run(run_id: str) -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE runs SET status = 'running' WHERE id = ?", (run_id,))
        conn.commit()
        cursor.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
        run = cursor.fetchone()
        mode = run[2]
        cursor.execute("SELECT * FROM run_items WHERE run_id = ? ORDER BY created_at", (run_id,))
        run_items = cursor.fetchall()
        for item in run_items:
            item_id = item[0]
            vendor = item[3]
            text_input = item[4]
            try:
                cursor.execute("UPDATE run_items SET status = 'running' WHERE id = ?", (item_id,))
                conn.commit()
                if mode == "isolated":
                    await process_isolated_mode(item_id, vendor, text_input, conn)
                elif mode == "chained":
                    await process_chained_mode(item_id, vendor, text_input, conn)
                cursor.execute("UPDATE run_items SET status = 'completed' WHERE id = ?", (item_id,))
                conn.commit()
            except Exception:
                cursor.execute("UPDATE run_items SET status = 'failed' WHERE id = ?", (item_id,))
                conn.commit()
        cursor.execute("UPDATE runs SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?", (run_id,))
        conn.commit()
    except Exception:
        cursor.execute("UPDATE runs SET status = 'failed' WHERE id = ?", (run_id,))
        conn.commit()
    finally:
        conn.close()


@router.get("/runs")
async def get_runs():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT r.*, p.name as project_name
            FROM runs r
            LEFT JOIN projects p ON r.project_id = p.id
            ORDER BY r.started_at DESC
            LIMIT 50
            """
        )
        runs = cursor.fetchall()
        for run in runs:
            cursor.execute(
                """
                SELECT ri.*, 
                       GROUP_CONCAT(m.metric_name || ':' || m.value, '|') as metrics_summary
                FROM run_items ri
                LEFT JOIN metrics m ON ri.id = m.run_item_id
                WHERE ri.run_id = ?
                GROUP BY ri.id
                """,
                (run["id"],),
            )
            run["items"] = cursor.fetchall()
            try:
                run["vendors"] = json.loads(run["vendor_list_json"])
            except Exception:
                run["vendors"] = []
        return {"runs": runs}
    finally:
        conn.close()


@router.get("/runs/{run_id}")
async def get_run_details(run_id: str):
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
        run = cursor.fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        cursor.execute(
            """
            SELECT ri.*
            FROM run_items ri
            WHERE ri.run_id = ?
            ORDER BY ri.created_at
            """,
            (run_id,),
        )
        items = cursor.fetchall()
        for item in items:
            cursor.execute("""SELECT * FROM metrics WHERE run_item_id = ?""", (item["id"],))
            item["metrics"] = cursor.fetchall()
            cursor.execute("""SELECT * FROM artifacts WHERE run_item_id = ?""", (item["id"],))
            item["artifacts"] = cursor.fetchall()
        run["items"] = items
        try:
            run["vendors"] = json.loads(run["vendor_list_json"])
            run["config"] = json.loads(run["config_json"] or "{}")
        except Exception:
            run["vendors"] = []
            run["config"] = {}
        return {"run": run}
    finally:
        conn.close()


@router.post("/runs/quick")
async def create_quick_run(text: str = Form(...), vendors: str = Form(...), mode: str = Form("isolated"), config: Optional[str] = Form(None)):
    try:
        vendor_list = [v.strip() for v in vendors.split(",")]
        cfg: Dict[str, Any] = {}
        if config:
            try:
                cfg = json.loads(config)
            except Exception:
                cfg = {}
        run_data = RunCreate(mode=mode, vendors=vendor_list, text_inputs=[text], config=cfg)
        result = await create_run(run_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    """Delete a run and all its associated data from the database.

    This will remove:
    - run_items for the run
    - metrics for those run_items
    - artifacts for those run_items
    - user_ratings for those run_items
    Then delete the run itself.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM runs WHERE id = ?", (run_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Run not found")

        # Find all run item ids for cascading deletes
        cursor.execute("SELECT id FROM run_items WHERE run_id = ?", (run_id,))
        item_rows = cursor.fetchall()
        item_ids = [row[0] for row in item_rows]

        if item_ids:
            qmarks = ",".join(["?"] * len(item_ids))
            # Delete dependent tables first
            cursor.execute(f"DELETE FROM metrics WHERE run_item_id IN ({qmarks})", item_ids)
            cursor.execute(f"DELETE FROM artifacts WHERE run_item_id IN ({qmarks})", item_ids)
            cursor.execute(f"DELETE FROM user_ratings WHERE run_item_id IN ({qmarks})", item_ids)
            cursor.execute(f"DELETE FROM run_items WHERE id IN ({qmarks})", item_ids)

        # Finally delete the run
        cursor.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        conn.commit()
        return {"message": "Run deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete run: {str(e)}")
    finally:
        conn.close()


@router.delete("/run-items/{item_id}")
async def delete_run_item(item_id: str):
    """Delete a single run item and all associated data from the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM run_items WHERE id = ?", (item_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Run item not found")

        cursor.execute("DELETE FROM metrics WHERE run_item_id = ?", (item_id,))
        cursor.execute("DELETE FROM artifacts WHERE run_item_id = ?", (item_id,))
        cursor.execute("DELETE FROM user_ratings WHERE run_item_id = ?", (item_id,))
        cursor.execute("DELETE FROM run_items WHERE id = ?", (item_id,))
        conn.commit()
        return {"message": "Run item deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete run item: {str(e)}")
    finally:
        conn.close()

