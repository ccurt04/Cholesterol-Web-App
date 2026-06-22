# ❤️ Heart-Health Coach

**🔗 Live demo: https://cholesterol-web-app.onrender.com**
*(The hosted demo runs without an API key, so it returns a clearly-labeled sample plan. Run it locally with your own `ANTHROPIC_API_KEY` — see below — to generate plans tailored to the numbers you enter.)*

A small web app that turns a cholesterol panel and everyday lifestyle habits into
a **personalized, realistic action plan** — and tracks the numbers over time. I
built it for my dad, who's working to lower his cholesterol.

It uses [Claude](https://www.anthropic.com/) (the Claude API) to write the plan,
with guardrails so it behaves like a responsible coach, not a doctor.

> ⚠️ **This is an educational lifestyle tool, not medical advice.** It never
> recommends starting, stopping, or changing medication, and every plan reminds
> the user to confirm changes with their physician.

---

## What it does

1. **Enter the details** — cholesterol numbers (total / LDL / HDL / triglycerides),
   age, weight, activity, diet habits, and a goal. As you type each lab value,
   a **live color-coded badge** reads it against standard medical guideline
   ranges (Optimal / Borderline / High) so the picture is clear instantly.
2. **Get a plan** — Claude returns an evidence-based plan: where they stand, a
   realistic goal and timeline, specific diet and movement changes, and what to
   re-test and when.
3. **Track progress** — log each new lab result; a **custom SVG trend chart**
   plots LDL over time against the "optimal" and "high" guideline bands, so
   improvement (the line heading down) is visible at a glance.

---

## Screens & flow

```
Browser (one page)
   │  fill the form  ─────────────►  POST /api/plan ──► Claude API ──► plan text
   │  log a lab result ───────────►  POST /api/entries ──► data/entries.json
   └  page loads ─────────────────►  GET  /api/entries  ◄── history
```

- **`app.py`** — Flask server. Builds the prompt, calls Claude, stores history.
- **`templates/index.html` + `static/`** — the single-page UI.
- **`evals/eval_safety.py`** — checks the model output stays safe (see below).
- **`data/`** — local history, **never committed** (it's personal health data).

---

## Run it locally

You need **Python 3.10+** and an **Anthropic API key**
([get one here](https://console.anthropic.com/)).

```bash
# 1. (optional but recommended) create a virtual environment
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate

# 2. install dependencies
pip install -r requirements.txt

# 3. set your API key
#    Windows PowerShell:
$env:ANTHROPIC_API_KEY = "sk-ant-..."
#    macOS/Linux:
export ANTHROPIC_API_KEY="sk-ant-..."

# 4. run
python app.py
```

Then open **http://localhost:5000** in your browser.

---

## Run the safety eval

Before trusting the output, run the evaluation harness. It sends a few test
profiles through the model and confirms every plan includes a disclaimer, defers
to a doctor, and never prescribes medication:

```bash
python evals/eval_safety.py
```

It exits non-zero if any case fails, so it can gate a deploy.

---

## How the guardrails work

The safety behavior lives in the **system prompt** (`build_system_prompt()` in
`app.py`). It instructs Claude to:

- open every plan with a one-line "not medical advice / see your doctor" note,
- never start, stop, or change a medication,
- base advice on mainstream guidance (less saturated fat, more soluble fiber,
  regular aerobic exercise, weight management, etc.),
- give **realistic** timelines and push back kindly on unrealistic goals.

`evals/eval_safety.py` then verifies the model actually does this.

---

## Runbook — handing this off

If someone else needs to take this over (or I'm setting it up fresh on a new
machine):

| Task | How |
|---|---|
| **It won't start** | Check Python 3.10+ (`python --version`) and `pip install -r requirements.txt`. |
| **"API key missing/invalid"** | The `ANTHROPIC_API_KEY` env var isn't set in the same terminal you ran `python app.py` from. Re-set it (step 3 above). |
| **Change the model** | Edit the `MODEL` constant at the top of `app.py` (e.g. to `claude-sonnet-4-6` for lower cost). |
| **Change the coaching behavior** | Edit `build_system_prompt()` in `app.py`, then re-run the eval. |
| **Reset history** | Delete `data/entries.json`. |
| **Where's the data?** | `data/entries.json`, on this machine only. Nothing is sent anywhere except the Anthropic API. |

---

## Built with Claude — what's mine vs. generated

I scoped the idea, designed the flow (form → plan → tracking), wrote the system
prompt and its safety rules, and defined what the eval should check. I used
Claude to help write the Flask and front-end code. I can walk through any part of
it and explain the decisions.

---

*Made for my dad. ❤️*
