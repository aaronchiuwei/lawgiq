"""One-shot Jev smoke test on a made-up example (no Clio).

Usage: python scripts/jev_test.py
Reads TYPESAFE_API_KEY (or JEV_API_KEY) from the environment or ./.env.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


def load_env(path=".env"):
    p = pathlib.Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


load_env()
API_KEY = os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY")
BASE_URL = os.environ.get("JEV_BASE_URL", "https://api.typesafe.ai").rstrip("/")
MODEL = os.environ.get("JEV_MODEL", "jev-latest")

if not API_KEY:
    sys.exit("No TYPESAFE_API_KEY / JEV_API_KEY found in env or .env")

EXAMPLE = {
    "source_type": "note",
    "title": "Client call - treatment update",
    "text": (
        "Spoke with client by phone. She reports continued lower back pain "
        "and her orthopedist ordered a lumbar MRI next week after PT did not help."
    ),
}

body = {
    "model": MODEL,
    "state": EXAMPLE,
    "questions": {
        "category": {
            "type": "choice",
            "instructions": "Which category best describes this case entry from a personal-injury law firm?",
            "criteria": {
                "incident_liability": "How the accident happened, fault, police reports, witness statements, admissions.",
                "injury_treatment": "Diagnoses, injuries, treatment visits, imaging findings, surgery, medical records.",
                "medical_bills": "Bills, liens, charges, medical specials amounts.",
                "coverage_insurance": "Insurance policies, policy limits, coverage disclosures, adjuster communication about coverage.",
                "settlement_negotiation": "Demand letters, offers, counteroffers, settlement discussions.",
                "litigation_deadline": "Lawsuit filings, court dates, depositions, statute of limitations, discovery deadlines.",
                "client_contact": "Actual conversations with the client (calls, meetings, substantive messages).",
                "routine_admin": "Scheduling, voicemails, records requests, reminders, internal housekeeping.",
            },
        },
        "shareable": {
            "type": "choice",
            "instructions": "Could this entry be shared with the client's treating medical provider?",
            "criteria": {
                "shareable": "Status changes, bills, records, treatment information.",
                "internal": "Case strategy, valuation reasoning, settlement tactics, confidential attorney communications.",
            },
        },
    },
}

req = urllib.request.Request(
    f"{BASE_URL}/v1/systemone",
    data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    method="POST",
)
print("POST", req.full_url)
print("REQUEST:", json.dumps(body, indent=2))
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')}")
print("RESPONSE:", json.dumps(data, indent=2))
