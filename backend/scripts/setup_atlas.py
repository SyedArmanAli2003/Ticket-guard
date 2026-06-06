"""Idempotent MongoDB Atlas bootstrap for TicketGuard.

Run ONCE (or any time the corpus/indexes change) to prepare the cluster:

    python scripts/setup_atlas.py

What it does (all idempotent — safe to re-run):
  1. Connect to Atlas (config.MONGODB_URI) and ensure the database exists.
  2. Create the five collections if missing:
       scam_corpus, tickets_seen, reports, investigations, official_rules
  3. Create the Atlas Search indexes on scam_corpus:
       • vector index  (path=embedding, numDimensions=config.EMBED_DIMS, cosine)
       • text  index   (full-text over text / pattern_type / source_pattern)
  4. Seed scam_corpus from data/scam_corpus.json WITH Gemini embeddings
     (skips rows that are already present, by text hash).
  5. Seed official_rules and a few demo tickets_seen hashes.
  6. Print a summary of everything it did.

HARD RULE: embeddings come from the real Gemini key (config.EMBED_MODEL). If the
key is missing this script refuses to seed fake/zero vectors — it tells you to
set GOOGLE_API_KEY and exits non-zero for the seeding step.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Allow running as `python scripts/setup_atlas.py` from the backend dir.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import certifi
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.operations import SearchIndexModel

import config
import db  # reuse embed_text + index helpers (single source of truth)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _text_hash(text: str) -> str:
    return hashlib.sha256((text or "").strip().encode("utf-8")).hexdigest()[:16]


def _connect() -> MongoClient:
    if not config.mongo_configured():
        print("❌ MONGODB_URI is not configured. Set it in .env and retry.")
        sys.exit(1)
    print(f"→ Connecting to Atlas (db={config.MONGODB_DB}) ...")
    client = MongoClient(config.MONGODB_URI, serverSelectionTimeoutMS=8000,
                         tls=True, tlsCAFile=certifi.where())
    client.admin.command("ping")
    ver = client.admin.command("buildInfo").get("version", "?")
    print(f"  ✅ connected — cluster version {ver}")
    return client


def ensure_collections(database) -> list[str]:
    """Create the five TicketGuard collections if missing."""
    wanted = [config.COLL_CORPUS, config.COLL_TICKETS_SEEN, config.COLL_REPORTS,
              config.COLL_INVESTIGATIONS, config.COLL_RULES]
    existing = set(database.list_collection_names())
    created = []
    for name in wanted:
        if name not in existing:
            database.create_collection(name)
            created.append(name)
    # Helper indexes (idempotent).
    database[config.COLL_REPORTS].create_index([("created_at", DESCENDING)], name="reports_recent")
    database[config.COLL_INVESTIGATIONS].create_index([("created_at", DESCENDING)], name="inv_recent")
    database[config.COLL_TICKETS_SEEN].create_index([("hash", ASCENDING)], unique=True,
                                                    name="ticket_hash_unique")
    print(f"  ✅ collections present: {', '.join(wanted)}"
          + (f"  (created: {', '.join(created)})" if created else "  (all already existed)"))
    return created


def ensure_indexes(database) -> dict:
    """Create the vector + Atlas Search text indexes (idempotent)."""
    coll = database[config.COLL_CORPUS]
    try:
        existing = {i["name"] for i in coll.list_search_indexes()}
    except Exception as exc:  # noqa: BLE001
        print(f"  ℹ️  could not list search indexes ({str(exc)[:80]})")
        existing = set()

    out = {"vector": "exists", "text": "exists"}

    if config.VECTOR_INDEX not in existing:
        try:
            coll.create_search_index(model=SearchIndexModel(
                definition={"fields": [{
                    "type": "vector", "path": config.VECTOR_PATH,
                    "numDimensions": config.EMBED_DIMS, "similarity": "cosine",
                }]},
                name=config.VECTOR_INDEX, type="vectorSearch"))
            out["vector"] = "created"
        except Exception as exc:  # noqa: BLE001
            out["vector"] = f"error: {str(exc)[:100]}"

    if config.TEXT_INDEX not in existing:
        try:
            coll.create_search_index(model=SearchIndexModel(
                definition={"mappings": {"dynamic": False, "fields": {
                    "text": {"type": "string"},
                    "pattern_type": {"type": "string"},
                    "source_pattern": {"type": "string"},
                }}},
                name=config.TEXT_INDEX))
            out["text"] = "created"
        except Exception as exc:  # noqa: BLE001
            out["text"] = f"error: {str(exc)[:100]}"

    print(f"  ✅ vector index '{config.VECTOR_INDEX}': {out['vector']}")
    print(f"  ✅ text index   '{config.TEXT_INDEX}': {out['text']}")
    print("     (Atlas Search indexes build asynchronously — give them a minute "
          "before querying.)")
    return out


def seed_corpus(database) -> dict:
    """Seed scam_corpus from data/scam_corpus.json WITH real Gemini embeddings."""
    path = DATA_DIR / "scam_corpus.json"
    if not path.exists():
        print(f"  ⚠️  {path} not found — skipping corpus seed.")
        return {"seeded": 0, "skipped": 0, "status": "no_file"}

    if not config.gemini_configured():
        print("  ❌ Gemini key missing — refusing to seed corpus without real "
              "embeddings (no fake vectors). Set GOOGLE_API_KEY and re-run.")
        return {"seeded": 0, "skipped": 0, "status": "not_configured"}

    rows = json.loads(path.read_text(encoding="utf-8"))
    coll = database[config.COLL_CORPUS]

    # Skip rows already present (idempotency by short text hash).
    existing_hashes = {d.get("text_hash") for d in coll.find({}, {"text_hash": 1})}
    seeded, skipped, failed = 0, 0, 0
    for i, row in enumerate(rows, 1):
        text = row.get("text", "")
        h = _text_hash(text)
        if h in existing_hashes:
            skipped += 1
            continue
        emb = db.embed_text(text)
        if emb is None:
            failed += 1
            print(f"     ✗ embed failed for row {i} (will retry on next run)")
            continue
        doc = dict(row)
        doc["text_hash"] = h
        doc["embedding"] = emb
        doc["seeded_at"] = datetime.now(timezone.utc)
        coll.insert_one(doc)
        seeded += 1
        if seeded % 10 == 0:
            print(f"     … {seeded} embedded + inserted")
        time.sleep(0.05)  # gentle on the embeddings quota

    print(f"  ✅ scam_corpus: seeded={seeded} skipped(existing)={skipped} failed={failed} "
          f"total_in_file={len(rows)}")
    return {"seeded": seeded, "skipped": skipped, "failed": failed, "status": "ok"}


# Official-transfer rule knowledge (deterministic engine reference; also queryable).
_OFFICIAL_RULES = [
    {"rule_id": "official_transfer_only",
     "title": "Major-event tickets transfer via the official app only",
     "detail": "Legitimate major-event tickets move through the official transfer/app. "
               "A PDF/screenshot/barcode-image 'ticket' is infinitely copyable and high risk.",
     "weight": 35, "source": "FTC/FBI guidance on event ticket fraud"},
    {"rule_id": "irreversible_payment",
     "title": "Irreversible payment rails remove buyer protection",
     "detail": "Zelle, CashApp, Venmo friends-and-family, crypto, wire, and gift cards have "
               "no chargeback path. Protected rails are card or PayPal Goods & Services.",
     "weight": 30, "source": "FTC consumer guidance"},
    {"rule_id": "price_far_below_face",
     "title": "Price far below face value is a bait signal",
     "detail": "Tickets priced well under face (≤50%) are a classic too-good-to-be-true lure.",
     "weight": 25, "source": "BBB scam tracker"},
    {"rule_id": "lookalike_domain",
     "title": "Lookalike / typosquat domains impersonate official sellers",
     "detail": "Domains a small edit-distance from official marketplaces are a top fraud vector.",
     "weight": 30, "source": "FBI IC3 advisories"},
    {"rule_id": "duplicate_barcode",
     "title": "A barcode/QR offered to multiple buyers is fraud",
     "detail": "The same barcode image can be sent to many buyers; only one scans in.",
     "weight": 35, "source": "FBI IC3 advisories"},
    {"rule_id": "advance_fee",
     "title": "Advance / holding fees before proof are advance-fee fraud",
     "detail": "Requests for a deposit, holding fee, or 'verification' payment before delivery.",
     "weight": 25, "source": "BBB scam tracker"},
    {"rule_id": "urgency_pressure",
     "title": "Manufactured urgency pressures buyers past due diligence",
     "detail": "'Only 2 left', 'pay in 30 min', sob-story emergencies compress decision time.",
     "weight": 12, "source": "BBB scam tracker"},
]

# A few demo tickets_seen hashes so duplicate-barcode detection has data to hit.
# These are SYNTHETIC references; the hash is what production would store.
_DEMO_SEEN_REFS = [
    ("WC2026-OPN-AX7723-DUPED", ["buyer_a@example.test", "buyer_b@example.test"]),
    ("BARCODE-558122997431", ["buyer_c@example.test"]),
    ("BOOKINGREF-ZK91-2026", ["buyer_d@example.test", "buyer_e@example.test", "buyer_f@example.test"]),
]


def seed_rules(database) -> int:
    coll = database[config.COLL_RULES]
    n = 0
    for rule in _OFFICIAL_RULES:
        coll.update_one({"rule_id": rule["rule_id"]}, {"$set": rule}, upsert=True)
        n += 1
    print(f"  ✅ official_rules: upserted {n} rules")
    return n


def seed_demo_seen(database) -> int:
    coll = database[config.COLL_TICKETS_SEEN]
    n = 0
    for ref, buyers in _DEMO_SEEN_REFS:
        h = hashlib.sha256(ref.strip().encode("utf-8")).hexdigest()
        coll.update_one(
            {"hash": h},
            {"$set": {"offered_to": len(buyers), "buyers": buyers, "demo": True,
                      "ref_label": ref},
             "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        n += 1
    print(f"  ✅ tickets_seen: upserted {n} demo barcode/ref hashes")
    return n


def main() -> int:
    print("=" * 70)
    print("TicketGuard — Atlas setup")
    print(f"  db={config.MONGODB_DB}  embed_model={config.EMBED_MODEL} "
          f"dims={config.EMBED_DIMS}  gemini={'configured' if config.gemini_configured() else 'MISSING'}")
    print("=" * 70)

    client = _connect()
    database = client[config.MONGODB_DB]

    print("\n[1/5] Collections")
    ensure_collections(database)

    print("\n[2/5] Atlas Search indexes")
    idx = ensure_indexes(database)

    print("\n[3/5] Seed scam_corpus (with real Gemini embeddings)")
    corpus = seed_corpus(database)

    print("\n[4/5] Seed official_rules")
    seed_rules(database)

    print("\n[5/5] Seed demo tickets_seen hashes")
    seed_demo_seen(database)

    print("\n" + "=" * 70)
    print("DONE.")
    print(f"  corpus: {corpus}")
    print(f"  indexes: {idx}")
    counts = {
        "scam_corpus": database[config.COLL_CORPUS].count_documents({}),
        "official_rules": database[config.COLL_RULES].count_documents({}),
        "tickets_seen": database[config.COLL_TICKETS_SEEN].count_documents({}),
        "reports": database[config.COLL_REPORTS].count_documents({}),
        "investigations": database[config.COLL_INVESTIGATIONS].count_documents({}),
    }
    print(f"  collection counts: {counts}")
    print("=" * 70)
    # Non-zero exit if corpus seeding was blocked by a missing key (CI signal).
    return 0 if corpus.get("status") in ("ok", "no_file") else 2


if __name__ == "__main__":
    raise SystemExit(main())
