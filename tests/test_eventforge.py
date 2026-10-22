"""EventForge Automated Quality, Security, Accessibility, and Invariant Test Suite.
Run: pytest tests/ -v
"""
import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

import sys
import re
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from starlette.testclient import TestClient
from backend.app import app
from backend.engines import evals
from backend.engines.spec import parse_intake, build_spec


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


# =============================================================================
# 1. BASELINE ALGORITHMIC EVALUATIONS (31/31 TESTS & 10/10 INVARIANTS)
# =============================================================================
def test_all_baseline_evaluations_and_seeded_invariants():
    """Verify that all 31 deterministic planning evaluations pass and 10/10 faults are caught."""
    res = evals.run_all()
    assert res["passed"] == res["total"], (
        f"Baseline evaluation failed: {res['passed']}/{res['total']} passed. "
        f"Failed details: {[r for r in res['results'] if not r['passed']]}"
    )
    assert res["seeded_detected"] == res["seeded_total"], (
        f"Seeded fault detection incomplete: {res['seeded_detected']}/{res['seeded_total']}"
    )


# =============================================================================
# 2. SECURITY HEADERS & DEFENSIVE MIDDLEWARE
# =============================================================================
def test_owasp_security_headers_present(client):
    """Verify that critical OWASP security headers are present on all HTTP responses."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    
    headers = resp.headers
    assert headers.get("x-content-type-options") == "nosniff", "Missing nosniff header"
    assert headers.get("x-frame-options") in ("SAMEORIGIN", "DENY"), "Missing x-frame-options header"
    assert headers.get("x-xss-protection") == "1; mode=block", "Missing xss protection header"
    assert "strict-origin-when-cross-origin" in headers.get("referrer-policy", ""), "Missing referrer-policy"
    assert "geolocation=()" in headers.get("permissions-policy", ""), "Missing permissions-policy"
    assert "content-security-policy" in headers, "Missing Content-Security-Policy header"


def test_cors_headers_allowed(client):
    """Verify CORS preflight requests are handled securely."""
    resp = client.options("/api/health", headers={"Origin": "https://eventforge.ai", "Access-Control-Request-Method": "GET"})
    assert resp.status_code in (200, 204)
    assert "access-control-allow-origin" in resp.headers


def test_payload_size_enforcement(client):
    """Verify oversized payloads (>10MB) are rejected with 413 Payload Too Large."""
    huge_data = "A" * (11 * 1024 * 1024)
    resp = client.post("/api/intake", content=huge_data, headers={"Content-Type": "application/json", "Content-Length": str(len(huge_data))})
    assert resp.status_code == 413


def test_safe_error_handling_no_traceback_leak(client):
    """Verify invalid routes or faulty data return clean JSON errors without leaking Python tracebacks."""
    resp = client.post("/api/projects/non-existent-pid-9999/whatif", json={"changes": {"guests": "invalid_number"}})
    assert resp.status_code in (400, 404, 422, 500)
    data = resp.json()
    assert "error" in data
    # Ensure raw Python stack traces (e.g. 'Traceback (most recent call last)') are not exposed to clients
    assert "Traceback" not in data["error"]
    assert 'File "' not in data["error"]


# =============================================================================
# 3. ACCESSIBILITY & WCAG 2.1 AA FRONTEND STRUCTURE
# =============================================================================
def test_accessibility_landmarks_and_semantics():
    """Verify index.html contains WCAG 2.1 AA accessible landmarks, skip link, and labels."""
    html_file = ROOT / "frontend" / "index.html"
    assert html_file.exists(), "frontend/index.html not found"
    html = html_file.read_text(encoding="utf-8")

    # Skip link
    assert 'class="skip-link"' in html, "Missing accessibility skip link"
    
    # ARIA landmarks & roles
    assert 'role="navigation"' in html, "Missing navigation landmark"
    assert 'role="main"' in html, "Missing main landmark"
    assert 'role="banner"' in html, "Missing banner landmark"
    assert 'role="complementary"' in html, "Missing complementary landmark"
    assert 'aria-live="polite"' in html, "Missing live announcer region for screen readers"
    assert 'lang="en"' in html, "Missing lang attribute on html tag"


def test_theme_configs_completeness():
    """Verify all 6 celebration themes are configured with palette, labels, and decor specifications."""
    v_vision_file = ROOT / "frontend" / "js" / "v_vision.js"
    assert v_vision_file.exists(), "v_vision.js not found"
    js = v_vision_file.read_text(encoding="utf-8")

    expected_themes = ["temple_red", "royal_gold", "minimal_sage", "boho_garden", "unicorn", "cultural_fair"]
    for theme in expected_themes:
        assert theme in js, f"Theme {theme} is missing in THEME_CONFIGS"


# =============================================================================
# 4. INPUT VALIDATION & DETERMINISTIC INTEGRITY
# =============================================================================
def test_intake_bounds_and_safety():
    """Verify input length capping and field sanitization."""
    # Extremely long string
    res = parse_intake("wedding " * 2000)
    assert res["fields"]["event_type"] == "wedding"

    # Edge case: Pydantic strictly rejects negative numbers with ValidationError
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        build_spec({"event_type": "birthday", "guests": -50, "budget_rupees": -100})
