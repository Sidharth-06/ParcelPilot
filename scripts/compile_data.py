"""Compile the ParcelPilot candidate data pack into typed JSON artifacts.

Outputs (committed to repo so runtime never parses PDFs/xlsx):
  src/data/generated/documents.json   - doc registry + section chunks
  src/data/generated/structured.json  - accounts / orders / tickets + snapshot time

Run:  python scripts/compile_data.py
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT.parent / "data"
OUT = ROOT / "src" / "data" / "generated"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- documents

DOCS = [
    {
        "doc_id": "DOC-001",
        "file": "01_Support_Policy_v3_CURRENT.pdf",
        "title": "Support Policy v3",
        "type": "POLICY",
        "status": "CURRENT",
        "authority_tier": 2,
        "effective_date": "2026-05-01",
        "supersedes": "DOC-002",
        "applies_to": ["*"],
    },
    {
        "doc_id": "DOC-002",
        "file": "02_Support_Policy_v2_DEPRECATED.pdf",
        "title": "Support Policy v2",
        "type": "POLICY",
        "status": "DEPRECATED",
        "authority_tier": 5,
        "effective_date": "2025-01-01",
        "superseded_by": "DOC-001",
        "applies_to": ["*"],
    },
    {
        "doc_id": "DOC-003",
        "file": "03_Cancellation_and_Service_Credit_SOP_v4.pdf",
        "title": "Cancellation & Service Credit SOP v4",
        "type": "SOP",
        "status": "CURRENT",
        "authority_tier": 2,
        "effective_date": "2026-06-15",
        "applies_to": ["*"],
    },
    {
        "doc_id": "DOC-004",
        "file": "04_Product_Operations_Guide_and_Known_Issues.pdf",
        "title": "Product Operations Guide & Known Issues",
        "type": "GUIDE",
        "status": "CURRENT",
        "authority_tier": 3,
        "effective_date": "2026-08-14",
        "applies_to": ["*"],
    },
    {
        "doc_id": "DOC-005",
        "file": "05_Northstar_Logistics_Enterprise_Agreement.pdf",
        "title": "Northstar Logistics Enterprise Agreement",
        "type": "CONTRACT",
        "status": "ACTIVE",
        "authority_tier": 1,
        "effective_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applies_to": ["ACCT-001"],
    },
    {
        "doc_id": "DOC-006",
        "file": "06_LumenWorks_Service_Agreement.pdf",
        "title": "LumenWorks Service Agreement",
        "type": "CONTRACT",
        "status": "ACTIVE",
        "authority_tier": 1,
        "effective_date": "2026-03-01",
        "end_date": "2027-02-28",
        "applies_to": ["ACCT-002"],
    },
]

SECTION_RE = re.compile(r"\n(?=\d{1,2}\.\s+[A-Z])")


def norm(s: str) -> str:
    return re.sub(r"[ \t]+", " ", s.replace("\u00a0", " ")).strip()


def compile_documents() -> dict:
    from pypdf import PdfReader

    registry, chunks = [], []
    for meta in DOCS:
        reader = PdfReader(str(RAW / meta["file"]))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        text = norm(text)
        parts = [p.strip() for p in SECTION_RE.split("\n" + text) if p.strip()]
        doc_chunks = []
        for i, part in enumerate(parts):
            first_line = part.split("\n", 1)[0][:120]
            m = re.match(r"^(\d{1,2})\.\s+(.*)", first_line)
            title = f"{m.group(1)}. {m.group(2)}" if m else ("Preamble" if i == 0 else f"Section {i}")
            cid = f"{meta['doc_id']}#{i + 1}"
            doc_chunks.append(
                {"chunk_id": cid, "doc_id": meta["doc_id"], "seq": i + 1, "title": title, "text": part}
            )
            chunks.append(doc_chunks[-1])
        registry.append({**meta, "chunks": len(doc_chunks)})
    return {"generated_at": datetime.now().isoformat(timespec="seconds"), "documents": registry, "chunks": chunks}


# --------------------------------------------------------------- structured

SNAPSHOT = "2026-08-16T11:00:00+05:30"


def cell(v):
    return None if v is None else v


def compile_structured() -> dict:
    import openpyxl

    wb = openpyxl.load_workbook(RAW / "ParcelPilot_Assessment_Data.xlsx", data_only=True)

    def rows(sheet):
        it = wb[sheet].iter_rows(values_only=True)
        header = [str(h).strip() if h else "" for h in next(it)]
        out = []
        for row in it:
            if all(v is None for v in row):
                continue
            rec = {}
            for k, v in zip(header, row):
                if isinstance(v, datetime):
                    v = v.strftime("%Y-%m-%d %H:%M")
                rec[k] = cell(v)
            out.append(rec)
        return out

    accounts, orders, tickets = rows("accounts"), rows("orders"), rows("tickets")
    for o in orders:
        o["shipment_fee_inr"] = float(o["shipment_fee_inr"] or 0)
        o["carrier_fault"] = bool(o["carrier_fault"])
        o["customer_fault"] = bool(o["customer_fault"])
    for t in tickets:
        if t.get("historical_resolution") == "":
            t["historical_resolution"] = None
    return {"snapshot_time": SNAPSHOT, "accounts": accounts, "orders": orders, "tickets": tickets}


if __name__ == "__main__":
    docs = compile_documents()
    (OUT / "documents.json").write_text(json.dumps(docs, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"documents.json: {len(docs['documents'])} docs, {len(docs['chunks'])} chunks")
    st = compile_structured()
    (OUT / "structured.json").write_text(json.dumps(st, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"structured.json: {len(st['accounts'])} accounts, {len(st['orders'])} orders, {len(st['tickets'])} tickets")
