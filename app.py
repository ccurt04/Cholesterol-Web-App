"""
Heart-Health Coach — a small Flask app that turns a person's cholesterol panel
and lifestyle habits into a personalized, evidence-based action plan using Claude,
and tracks their numbers over time.

This is an educational lifestyle tool, NOT medical advice. See the disclaimer in
the UI and in build_system_prompt().
"""

import json
import os
import time
from collections import deque
from datetime import date
from pathlib import Path

import anthropic
from flask import Flask, jsonify, render_template, request

# Model is a constant so it's easy to change. claude-opus-4-8 is Anthropic's most
# capable model; swap to "claude-sonnet-4-6" if you want lower cost.
MODEL = "claude-opus-4-8"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
ENTRIES_FILE = DATA_DIR / "entries.json"

# Rate limit for the public demo: cap how many plans (Claude calls) can run per
# hour so a public URL can't run up the API bill. Tune via env vars.
PLAN_RATE_LIMIT = int(os.environ.get("PLAN_RATE_LIMIT", "30"))
PLAN_RATE_WINDOW = 3600  # seconds
_plan_calls = deque()

# Shown by the public demo when no API key is configured. It is a real example
# of the app's output (generated with Claude), served so the hosted demo works
# without a paid key. Running locally with ANTHROPIC_API_KEY set produces a plan
# tailored to the numbers entered.
SAMPLE_PLAN = """This is an educational tool, not medical advice — confirm any changes with your doctor before acting on them.

### Where you stand today
Your total cholesterol (240) and LDL (160) are both in the "high" range, your HDL (40) is on the low side, and your triglycerides (180) are borderline high. Together that's a pattern worth taking seriously, but it's also the kind that responds well to steady lifestyle changes.

### A realistic goal & timeline
Aiming to bring LDL down by roughly 15–25 points over the next 10–12 weeks is realistic through diet and activity alone. Bigger or faster drops usually need a doctor's involvement — so book a check-in and a repeat panel for about 12 weeks out.

### Diet changes
- **Cut back:** red and processed meat, fried/fast food, full-fat dairy, and sugary drinks — these drive saturated fat and triglycerides up.
- **Add:** soluble fiber (oats, beans, lentils, apples, barley), fatty fish twice a week, nuts, olive oil, and plenty of vegetables.
- **Swap:** soda for water or unsweetened tea; butter for olive oil; chips for a handful of almonds.

### Movement plan
Build toward **30 minutes of brisk activity, 5 days a week** (walking counts). If that's a lot right now, start at 10–15 minutes daily and add 5 minutes each week.

### Other habits
Aim for modest weight loss if applicable (even 5–7 lbs helps), keep alcohol light, and prioritize sleep — all three move these numbers.

### What to track & when to re-test
Log your weight weekly and your lab numbers each time you re-test. Re-check the full lipid panel in about 12 weeks and bring it to your doctor.

*Sample output shown in the hosted demo. Run the app locally with your own Anthropic API key for a plan personalized to the numbers you enter.*"""

app = Flask(__name__)

# Create the client lazily so the page still loads (and the tracking features
# still work) even if the API key isn't set yet. The client reads
# ANTHROPIC_API_KEY from the environment — don't hardcode a key.
_client = None


def get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def build_system_prompt() -> str:
    return (
        "You are a careful, encouraging heart-health coach. You take a person's "
        "cholesterol panel and lifestyle habits and produce a clear, realistic, "
        "evidence-based lifestyle plan aimed at improving their cholesterol over "
        "time.\n\n"
        "Hard rules:\n"
        "1. You are NOT a doctor and this is NOT medical advice. Open every plan "
        "with a one-line reminder to confirm any changes with their physician, "
        "especially before changing or stopping any medication.\n"
        "2. Never tell them to start, stop, or change a medication or dose. If "
        "their numbers look high-risk, tell them to see their doctor promptly.\n"
        "3. Base suggestions on mainstream guidance: reduce saturated and trans "
        "fat, increase soluble fiber, more vegetables/whole grains/legumes, "
        "regular aerobic exercise, weight management, limit alcohol, stop "
        "smoking. Be specific and actionable, not generic.\n"
        "4. Give a realistic timeline. Lifestyle change typically moves LDL "
        "modestly (often ~5-15%) over 6-12 weeks; do not promise large or fast "
        "drops. If their goal is unrealistic by lifestyle alone, say so kindly "
        "and point them to their doctor.\n\n"
        "Format the plan in clear sections with short headers and bullet points:\n"
        "- A one-line medical disclaimer\n"
        "- Where they stand today (plain-language read of their numbers)\n"
        "- A realistic goal & timeline\n"
        "- Diet changes (specific foods to add and cut)\n"
        "- Movement plan (concrete weekly target)\n"
        "- Other habits\n"
        "- What to track and when to re-test\n"
        "Keep a warm, motivating tone. Address the person directly."
    )


def build_user_prompt(d: dict) -> str:
    lines = ["Here are the person's details:"]
    for label, key in [
        ("Name", "name"),
        ("Age", "age"),
        ("Sex", "sex"),
        ("Height", "height"),
        ("Weight", "weight"),
        ("Total cholesterol (mg/dL)", "total_chol"),
        ("LDL (mg/dL)", "ldl"),
        ("HDL (mg/dL)", "hdl"),
        ("Triglycerides (mg/dL)", "triglycerides"),
        ("Activity level", "activity"),
        ("Typical diet", "diet"),
        ("Smokes?", "smokes"),
        ("Goal (how much to lower & by when)", "goal"),
        ("Other notes", "notes"),
    ]:
        val = (d.get(key) or "").strip()
        if val:
            lines.append(f"- {label}: {val}")
    lines.append(
        "\nWrite their personalized heart-health plan following all your rules."
    )
    return "\n".join(lines)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/plan", methods=["POST"])
def plan():
    data = request.get_json(force=True) or {}
    if not data.get("ldl") and not data.get("total_chol"):
        return jsonify({"error": "Please enter at least a total or LDL cholesterol number."}), 400
    # No key (e.g. the free hosted demo): serve a clearly-labeled sample plan.
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return jsonify({"plan": SAMPLE_PLAN, "demo": True})
    # Demo rate limit
    now = time.time()
    while _plan_calls and now - _plan_calls[0] > PLAN_RATE_WINDOW:
        _plan_calls.popleft()
    if len(_plan_calls) >= PLAN_RATE_LIMIT:
        return jsonify({"error": "Demo limit reached for this hour. Please try again later."}), 429
    _plan_calls.append(now)
    try:
        response = get_client().messages.create(
            model=MODEL,
            max_tokens=4000,
            thinking={"type": "adaptive"},
            system=build_system_prompt(),
            messages=[{"role": "user", "content": build_user_prompt(data)}],
        )
    except anthropic.AuthenticationError:
        return jsonify({"error": "Claude API key missing or invalid. Set ANTHROPIC_API_KEY (see README)."}), 500
    except anthropic.APIError as e:
        return jsonify({"error": f"Claude API error: {e}"}), 502

    plan_text = "".join(b.text for b in response.content if b.type == "text")
    return jsonify({"plan": plan_text, "demo": False})


def _load_entries() -> list:
    if ENTRIES_FILE.exists():
        return json.loads(ENTRIES_FILE.read_text())
    return []


@app.route("/api/entries", methods=["GET", "POST"])
def entries():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
        items = _load_entries()
        items.append(
            {
                "date": data.get("date") or date.today().isoformat(),
                "total_chol": data.get("total_chol", ""),
                "ldl": data.get("ldl", ""),
                "hdl": data.get("hdl", ""),
                "triglycerides": data.get("triglycerides", ""),
                "weight": data.get("weight", ""),
            }
        )
        items.sort(key=lambda x: x["date"])
        ENTRIES_FILE.write_text(json.dumps(items, indent=2))
        return jsonify({"ok": True, "entries": items})
    return jsonify({"entries": _load_entries()})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
