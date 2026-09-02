# Agent Factory — BoxLang + AI Hackathon

**Challenge #02 — Agent Factory:** *"Build an agent that builds agents. Accept a
description of a problem and generate a working BX Agents project designed to solve it."*

Output projects follow the [BxAgents](https://bxagents.ai) convention (`Agent.bx` +
`tools/*.bx`, one file per tool, discovered automatically by `bxAgents build`).

```
"Create an agent that reviews my app logs and flags unusual behavior"
   │
   ▼  ArchitectAgent      LLM, structured extraction only (no code writing)
   AgentSpec { agentName, role, instructions, memoryType, tools[], examplePrompts[] }
   │
   ▼  BuilderAgent        deterministic templating: spec → runnable BxAgents project
   generated/<slug>/ { Agent.bx, instructions.md, tools/<toolName>.bx, README.md, spec.json }
   (every tool starts as an honestly-labeled stub: "[SIMULATED - no live data source connected yet]")
   │
   ▼  CoderBuilderAgent   agentic: rewrites each tool file with real BoxLang/Java code
                          when the tool's job is pure computation or reading THIS
                          machine's own local state - or leaves an honest
                          "[NEEDS REAL API]" message when it genuinely needs a real,
                          keyed external service. Self-tests via `bxAgents build` +
                          repairs its own syntax errors; never leaves the project
                          worse than the stub baseline.
   │
   ▼  QAAgent             `bxAgents build` (discovery + validation + codegen) - free,
                          no API key
   │
   ▼  repair loop          on FAIL, Architect.redesign() with the error as feedback (≤ maxRepairs)
   │
   ▼  report               PASS/FAIL + the generated files
```

The only LLM step that "understands" the problem is spec extraction (Architect) —
classification, not code generation. Turning that spec into valid BoxLang is the
deterministic templates' job. The one exception is CoderBuilderAgent, which *does*
write code — but only ever real, working local-machine code or an honest "needs a
real API key" stub, self-verified against `bxAgents build` before anything is kept.

## Structure

```
web/                        served by BoxLang MiniServer
  index.html · app.js · styles.css   AgentPromptPage · BlueprintView · BuildProgress · AgentPlayground
  Application.bx             registers the /backend mapping
  api/
    build.bxs               POST { prompt } | { spec }  → full report
    run.bxs                 POST { slug }               → re-run QA (bxAgents build, free)
    runLive.bxs              POST { slug, message? }      → bxAgents invoke against the real provider
    health.bxs

backend/
  AgentFactory.bx           orchestrator (Architect → Builder → Coder → QA → repair → report)
  agents/
    ArchitectAgent.bx       problem statement → AgentSpec        (LLM)
    BuilderAgent.bx         AgentSpec → project files            (deterministic)
    CoderBuilderAgent.bx    agentic: real tool implementations, self-tested + self-repaired
    QAAgent.bx              `bxAgents build`
  lib/
    Renderer.bx             the deterministic templating engine (BxAgents convention output)
    Validator.bx            ProcessBuilder wrapper for `bxAgents build` / `bxAgents invoke`
  tools/                    CreateFile / RunProject / ReadError / Capability
                            (the agentic Builder's own tools - used by CoderBuilderAgent)
  templates/                agent-bx · tool-bx · README.md
  sample-spec.json          hand-written spec for no-key testing
  testPipeline.bxs          Builder + QA on sample-spec.json, no key

generate.bxs                CLI entry (same pipeline as the API)
serve.ps1 / serve.sh        start MiniServer on http://127.0.0.1:8080
miniserver.json
generated/                  output (gitignored) - each is a standalone BxAgents project
```

## Setup

Requires the `bx-ai` and `bx-agents` BoxLang modules:

```bash
install-bx-module bx-ai bx-agents
```

`bx-agents` pulls in several transitive dependencies (`qb`, `cbauth`, `cbstorages`,
`cbpaginator`, ...) whose caret-range versions (`^13.1.0` etc.) the installer can't
always resolve automatically — if `install-bx-module bx-agents` fails partway
through on a `404`, install the named dependency it stopped on with a concrete
version (check available versions at `https://www.forgebox.io/api/v1/entry/<name>/versions`)
and re-run.

```bash
cp .env.example .env          # set the key for your provider; match "provider" in boxlang.json
```

## Run

### Web (demo)

```bash
./serve.ps1
```

Open <http://127.0.0.1:8080/>. "spec mode" builds with no LLM (paste JSON, skips the
agentic Coder step too); the prompt box needs a provider key.

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

Then, from inside a generated project:

```bash
cd generated/<slug>
bxAgents build
bxAgents chat                                 # interactive
bxAgents invoke --message="..."               # single non-interactive turn
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
    "files": [ { "path": "Agent.bx", "content": "..." }, { "path": "tools/searchLogs.bx", ... }, ... ],
    "attempts": [ { "attempt": 0, "checkPass": true, "verdict": "PASS", "checkLog": "..." } ]
  }

POST /api/run.bxs   { "slug": "log-analyzer-agent" }
→ { "checkPass": true, "verdict": "PASS", "checkLog": "..." }

POST /api/runLive.bxs   { "slug": "log-analyzer-agent", "message": "..." }
→ { "passed": true, "output": "...", "message": "..." }
```

## Status

Verified end to end, both with and without an API key:

- **spec mode** (no key): MiniServer → build.bxs → Builder → QA (`bxAgents build`) →
  `PASS`, files render correctly in the BxAgents convention.
- **prompt mode** (real key): Architect → spec → Builder → CoderBuilderAgent writes
  real tool bodies (verified with disk-space/RAM tools reading genuine live values
  via Java interop) → QA → `PASS` → `bxAgents invoke` returns a real LLM answer
  built on that real tool data.
- Tools that would need a real external API (news, weather, stock data, ...) are
  left with an honest `[NEEDS REAL API]` message instead of fabricated data.

Known gap: there's no free functional smoke test in this pipeline — `bxAgents test`
needs TestBox installed under `tests/` (`cd tests && box install`), which needs a
working CommandBox (`box`) install; that wasn't reliably available in this
environment, so QA relies on `bxAgents build` (structural) plus an optional real
`bxAgents invoke` call for functional verification.

## Next

- [ ] Get CommandBox (`box`) working reliably so `bxAgents test` can be the free
      functional QA step instead of only structural `bxAgents build`
- [ ] RAG over `bx-ai-intro/examples/` — closest examples as few-shot for real tool bodies
- [ ] `AgentSpec.bx` typed structured output instead of `returnFormat: "json"`
- [ ] multi-agent output (`subagents/`) when the problem needs specialists
- [ ] progress streaming (SSE) so BuildProgress fills live instead of on completion
