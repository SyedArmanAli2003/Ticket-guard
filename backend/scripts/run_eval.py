"""Precision/recall evaluation for TicketGuard verdicts.

Calls the RUNNING backend (POST /api/check) for each labelled example in
``backend/data/eval_set.json``, maps each returned verdict to a binary
scam / not-scam prediction, and reports precision / recall / F1 / accuracy for
the SCAM class plus a confusion matrix.

Usage (backend must be running, e.g. `uvicorn main:app --port 8001`):
    python scripts/run_eval.py --base http://127.0.0.1:8001 --limit 50 --delay 1.0

FREE-TIER WARNING: gemini-2.5-flash free tier allows only ~20 generate requests
PER DAY, and each example costs 2 Gemini calls (normalizer + verdict). A full
50-example run needs ~100 calls. Use a small --limit, a fresh GOOGLE_API_KEY, or
Vertex AI (GOOGLE_GENAI_USE_VERTEXAI=TRUE) to avoid 429 RESOURCE_EXHAUSTED. The
harness stops cleanly and reports partial metrics when the quota is hit.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib import error, request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console safety

DATA = Path(__file__).resolve().parent.parent / "data" / "eval_set.json"


def predict(base: str, text: str, timeout: float = 180.0) -> dict:
    body = json.dumps({"type": "text", "text": text}).encode("utf-8")
    req = request.Request(base.rstrip("/") + "/api/check", data=body,
                          headers={"Content-Type": "application/json"})
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def to_binary(verdict: str) -> str:
    """Map the 3-way verdict to a binary scam/not-scam label.

    SCAM -> scam ; SUSPICIOUS and LIKELY-LEGIT -> legit (strict SCAM positive class).
    """
    return "scam" if (verdict or "").upper() == "SCAM" else "legit"


def main() -> int:
    ap = argparse.ArgumentParser(description="TicketGuard eval (precision/recall on SCAM).")
    ap.add_argument("--base", default="http://127.0.0.1:8001", help="backend base URL")
    ap.add_argument("--limit", type=int, default=50, help="max examples to evaluate")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between calls (rate limit)")
    args = ap.parse_args()

    if not DATA.exists():
        print(f"eval_set.json not found at {DATA}")
        return 1
    rows = json.loads(DATA.read_text(encoding="utf-8"))[: args.limit]

    tp = fp = tn = fn = correct = done = errors = 0
    print(f"Evaluating {len(rows)} example(s) against {args.base}\n")
    for i, row in enumerate(rows, 1):
        gold = (row.get("expected_label") or row.get("label") or "").lower()
        try:
            res = predict(args.base, row.get("text", ""))
        except error.HTTPError as exc:
            print(f"[{i:02d}] HTTP {exc.code} from backend — stopping.")
            errors += 1
            break
        except Exception as exc:  # noqa: BLE001
            print(f"[{i:02d}] request error: {str(exc)[:90]} — stopping.")
            errors += 1
            break

        if res.get("status") != "ok":
            reason = str(res.get("reason"))[:90]
            print(f"[{i:02d}] backend status={res.get('status')} ({reason})")
            errors += 1
            if any(t in reason for t in ("429", "RESOURCE_EXHAUSTED")) or "quota" in reason.lower():
                print("     -> Gemini quota hit; stopping and reporting partial metrics.")
                break
            continue

        pred = to_binary(res.get("verdict"))
        ok = pred == gold
        correct += int(ok)
        done += 1
        if gold == "scam" and pred == "scam":
            tp += 1
        elif gold != "scam" and pred == "scam":
            fp += 1
        elif gold != "scam" and pred != "scam":
            tn += 1
        else:
            fn += 1
        print(f"[{i:02d}] gold={gold:5s} verdict={str(res.get('verdict')):12s} "
              f"pred={pred:5s} conf={res.get('confidence')} score={res.get('risk_score')} "
              f"{'OK' if ok else 'X'}")
        time.sleep(args.delay)

    print("\n" + "=" * 56)
    if done:
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        acc = correct / done
        print(f"Evaluated {done}   (errors/skipped: {errors})")
        print(f"Confusion (SCAM = positive): TP={tp} FP={fp} TN={tn} FN={fn}")
        print(f"Precision(SCAM)={prec:.3f}  Recall(SCAM)={rec:.3f}  "
              f"F1={f1:.3f}  Accuracy={acc:.3f}")
        thresholds_ok = prec >= 0.75 and rec >= 0.70 and acc >= 0.72
        print("RESULT: PASS" if thresholds_ok
              else "RESULT: BELOW THRESHOLD (need prec>=0.75, rec>=0.70, acc>=0.72)")
    else:
        print("No examples completed — Gemini quota or backend unreachable. "
              "Re-run when quota resets (or use a fresh key / Vertex AI).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
