# Agent Factory — BoxLang + AI Hackathon

**Challenge #02 — Agent Factory:** *"Build an agent that builds agents. Accept a
description of a problem and generate a working BX Agents project designed to solve it."*

```
"Create an agent that reviews my app logs and flags unusual behavior"
   │
   ▼  ArchitectAgent   LLM, structured extraction only (no code writing)
   AgentSpec { agentName, role, instructions, memoryType, tools[], examplePrompts[] }
   │
   ▼  BuilderAgent     deterministic templating: spec → runnable project
   generated/<slug>/ { run.bxs, boxlang.json, README.md, spec.json }
   │
   ▼  QAAgent          boxlang check + offline mock run (bx-ai mock provider, no key)
   │
   ▼  repair loop       on FAIL, Architect.redesign() with the error as feedback (≤ maxRepairs)
   │
   ▼  report            PASS/FAIL + the generated files
```

The only LLM step is spec extraction — classification, not code generation. Emitting
valid BoxLang is the deterministic templates' job, and they're tested once.

## Structure (maps to the team plan)

```
web/                        served by BoxLang MiniServer
  index.html · app.js · styles.css   AgentPromptPage · BlueprintView · BuildProgress · AgentPlayground
  Application.bx             registers the /backend mapping
  api/
    build.bxs               POST { prompt } | { spec }  → full report
    run.bxs                 POST { slug }               → re-run QA
    health.bxs

backend/
  AgentFactory.bx           orchestrator (Architect → Builder → QA → repair → report)
  agents/
    ArchitectAgent.bx       problem statement → AgentSpec        (LLM)
    BuilderAgent.bx         AgentSpec → project files            (deterministic)
    QAAgent.bx              boxlang check + offline mock run
  lib/
    Renderer.bx             the deterministic templating engine
    Validator.bx            ProcessBuilder wrapper for boxlang check / mock run
  tools/                    CreateFile / RunProject / ReadError / Capability
                            (for the stretch "agentic Builder" mode; not on the default path)
  templates/                run.bxs · tool-snippet · boxlang.json · README.md
  sample-spec.json          hand-written spec for no-key testing
  testPipeline.bxs          Builder + QA on sample-spec.json, no key

generate.bxs                CLI entry (same pipeline as the API)
serve.ps1 / serve.sh        start MiniServer on http://127.0.0.1:8080
miniserver.json
generated/                  output (gitignored)

src/ + profiler/            pre-pivot reference (a hand-written profiler agent) — not built here
```

## Run

```bash
cp .env.example .env          # set the key for your provider; match "provider" in boxlang.json
```

### Web (demo)

```bash
./serve.ps1
```

Open <http://127.0.0.1:8080/>. "spec mode" builds with no LLM (paste JSON); the prompt
box needs a provider key.

### CLI

```bash
./bx.ps1 generate.bxs "Create an agent that reviews my app logs and flags unusual behavior"
```

```bash
./bx.ps1 generate.bxs --spec=backend/sample-spec.json      # no key needed
```

```bash
./bx.ps1 backend/testPipeline.bxs                          # no key needed
```

## API contract (for the frontend)

```
POST /api/build.bxs
  { "prompt": "Create an agent that analyzes logs", "provider": "", "model": "", "maxRepairs": 1 }
  — or —  { "spec": { agentName, role, instructions, tools[], examplePrompts[] } }
→ {
    "success": true,
    "slug": "log-analyzer-agent",
    "spec": { ... },
    "projectDir": "...",
    "files": [ { "path": "run.bxs", "content": "..." }, ... ],
    "attempts": [ { "attempt": 0, "checkPass": true, "mockPass": true, "verdict": "PASS",
                    "checkLog": "...", "mockLog": "..." } ]
  }

POST /api/run.bxs   { "slug": "log-analyzer-agent" }
→ { "verdict": "PASS", "checkPass": true, "mockPass": true, "checkLog": "...", "mockLog": "..." }
```

## Status

Verified end to end **without an API key** (spec mode): MiniServer → build.bxs →
Builder → QA → `PASS`, and run.bxs → `PASS`. The UI renders blueprint, files,
progress and playground. The `prompt` path (ArchitectAgent → LLM) needs a key —
that's the one thing left to exercise.

## Next

- [ ] `prompt` path green with the event's key; tune the Architect schema from real output
- [ ] RAG over `bx-ai-intro/examples/` — closest examples as few-shot for real tool bodies
- [ ] real tool-body generation (not stubs) with per-tool `boxlang check`
- [ ] `AgentSpec.bx` typed structured output instead of `returnFormat: "json"`
- [ ] multi-agent output (sub-agents) when the problem needs specialists
- [ ] progress streaming (SSE) so BuildProgress fills live instead of on completion
