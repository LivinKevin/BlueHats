# Agent Factory — BoxLang + AI Hackathon

**Challenge #02 — Agent Factory:** *"Build an agent that builds agents. Accept a
description of a problem and generate a working BX Agents project designed to solve it."*

Describe a problem in plain English → get a runnable [BxAgents](https://bxagents.ai)
project (`Agent.bx` + one `tools/*.bx` file per tool, `@AITool`-annotated,
discovered automatically by `bxAgents build`), automatically validated, with a
repair loop.

## Quick demo

```bash
./bx.ps1 generate.bxs "Report this machine's free disk space and memory"
```

```bash
cd generated/<slug>
bxAgents build
bxAgents invoke --message="how much disk do I have?"
```

The generated agent answers with real values read off this machine via Java interop.

## How it works

```
"Create an agent that reviews my app logs and flags unusual behavior"
   │
   ▼  ArchitectAgent      LLM (aiChat, returnFormat:"json") — structured extraction only, no code
   AgentSpec { agentName, role, instructions, memoryType, tools[], examplePrompts[] }
   │
   ▼  BuilderAgent        deterministic templating: spec → runnable BxAgents project
   generated/<slug>/ { Agent.bx, instructions.md, tools/<toolName>.bx, README.md, spec.json }
   (every tool starts as an honestly-labeled stub: "[SIMULATED - no live data source connected yet]")
   │
   ▼  CoderBuilderAgent   agentic (aiAgent + 4 tools): rewrites each tool file with real
                          BoxLang/Java code when the job is pure computation or reading
                          THIS machine's own state — otherwise leaves an honest
                          "[NEEDS REAL API]" message. Backs up every tool file first,
                          restores it if the pass doesn't end with `bxAgents build` green.
   │
   ▼  QAAgent             `bxAgents build` (discovery + validation + codegen) — free, no API key
   │
   ▼  repair loop          on FAIL, Architect.redesign() with the build error as feedback (≤ maxRepairs)
   │
   ▼  report               PASS/FAIL + spec + generated files + attempt log
```

The only LLM step that *understands* the problem is spec extraction (Architect) —
classification, not code generation. Turning that spec into valid BoxLang is the
deterministic templates' job. The one exception is CoderBuilderAgent, which *does*
write code — but only ever real working local-machine code or an honest
"needs a real API key" stub, self-verified against `bxAgents build` before anything is kept.

**It never fabricates.** A stub says it's a stub; a tool that needs a key says so.

## BoxLang AI used

| Feature | Where | How |
|---|---|---|
| `aiChat( messages, params, options )` with `returnFormat: "json"` | `backend/agents/ArchitectAgent.bx` | The single "problem → spec" call. `params = { max_tokens, model? }`, `options = { returnFormat:"json", provider?, apiKey? }`. |
| `aiAgent( name, description, instructions, model, tools, params )` | `backend/agents/CoderBuilderAgent.bx` | The agentic tool-implementer — reasons, calls tools, loops. |
| `aiTool( name, description, closure )` + fluent `.describeX()` | `backend/tools/*.bx` | The Coder's four tools: `createFile`, `runProject`, `readErrors`, `listCapabilities`. |
| `aiModel( provider:, params: )` | `CoderBuilderAgent` + every generated `Agent.bx` | Binds a provider + model to an agent; `aiModel()` falls back to config default. |
| `@AITool` annotation | every generated `tools/<name>.bx` | The BxAgents one-file-per-tool, annotation-discovery convention. |
| `class extends "bxModules.bxai.models.runnables.AiAgent"` | `backend/templates/agent-bx.tmpl` | The generated output *is* a bx-ai agent. |
| Provider abstraction (`openrouter` / `openai` / `claude` / `gemini` / `mock` …) | `boxlang.json` `modules.bxai.settings` + per-call `options.provider` / `options.apiKey` | One code path across providers; per-request API key threaded through from the frontend. |

## Structure

```
backend/
  AgentFactory.bx           orchestrator (Architect → Builder → Coder → QA → repair → report)
  agents/
    ArchitectAgent.bx       problem statement → AgentSpec            (LLM: aiChat)
    BuilderAgent.bx         AgentSpec → project files                (deterministic → Renderer)
    CoderBuilderAgent.bx    agentic (aiAgent): real tool code, self-tested + self-repaired
    QAAgent.bx              verdict via `bxAgents build`
  lib/
    Renderer.bx             deterministic templating engine (BxAgents-convention output)
    Validator.bx            java.lang.ProcessBuilder wrapper for `bxAgents build` / `bxAgents invoke`
    ProgressReporter.bx     writes pipeline phase/turn snapshots for the UI build bar
    ProgressStore.bx        concurrent read/sweep of the shared progress map
  tools/                    CreateFile / RunProject / ReadError / Capability (CoderBuilderAgent's tools)
  templates/                agent-bx.tmpl · tool-bx.tmpl · README.md.tmpl
  sample-spec.json          hand-written spec for no-key testing
  testPipeline.bxs          Builder + QA on sample-spec.json, no key

web/                        the demo UI served directly by BoxLang MiniServer
  index.html · app.js · styles.css   vanilla HTML/JS — has "spec mode" (build with no key)
  Application.bx             /backend mapping + the shared build-progress map
  api/
    build.bxs               POST { prompt | spec, provider?, model?, apiKey?, buildId? } → report
    run.bxs                 POST { slug }                → re-run QA (bxAgents build, free)
    runLive.bxs             POST { slug, message? }      → bxAgents invoke against the real provider
    progress.bxs            GET  ?buildId=…              → current pipeline phase for the build bar
    health.bxs

frontend/                   the polished demo UI — Vite + React + Tailwind v4 + framer-motion
  src/components/Hero.jsx    prompt input + animated progress
  src/components/BuildResult.jsx   blueprint, generated-file code viewer, playground re-run buttons
  vite.config.js            dev-proxies /api → http://127.0.0.1:8080
  amplify.yml               AWS Amplify build spec (npm ci && npm run build)

deploy/                     AWS deployment: EC2 + nginx + systemd for the backend, Amplify for frontend
generate.bxs                CLI entry (same pipeline as the API)
serve.ps1 / serve.sh        start MiniServer on http://127.0.0.1:8080
boxlang.json                bx-ai config (provider, pinned model, per-provider overrides)
generated/                  output (gitignored) — each is a standalone BxAgents project
```

## Setup

**Prerequisites:** BoxLang 1.17+, Java 21+, and the `bx-ai` + `bx-agents` modules:

```bash
install-bx-module bx-ai bx-agents
```

`bx-agents` pulls transitive deps (`qb`, `cbauth`, `cbstorages`, `cbpaginator`, …)
whose caret-range versions (`^13.1.0` etc.) the installer can't always resolve — if
`install-bx-module bx-agents` fails partway on a `404`, install the module it stopped
on by name with no version (`install-bx-module qb`), then re-run. Repeat until it
completes clean. (Available versions: `https://www.forgebox.io/api/v1/entry/<name>/versions`.)

```bash
cp .env.example .env          # set the key for your provider; match "provider" in boxlang.json
```

## Run

### Web — React UI (the demo)

```bash
./serve.ps1                                   # BoxLang backend on :8080
```

```bash
cd frontend && npm install && npm run dev      # UI on :5173, dev-proxies /api → :8080
```

Type a problem, paste a provider API key in the key field, watch the live progress
bar, get the blueprint + generated files + a playground to re-run the agent.

### CLI

```bash
./bx.ps1 generate.bxs "Create an agent that reviews my app logs and flags unusual behavior"
```

```bash
./bx.ps1 generate.bxs --spec=backend/sample-spec.json      # no key: skips the LLM, builds from a spec
```

```bash
./bx.ps1 backend/testPipeline.bxs                          # no key: deterministic Builder + QA
```

### Web — vanilla UI (alternative)

`./serve.ps1`, then <http://127.0.0.1:8080/>. Same backend as the React UI, plus a
**spec mode** toggle that builds straight from pasted JSON with no LLM call.

From inside a generated project:

```bash
cd generated/<slug>
bxAgents build
bxAgents chat                                 # interactive
bxAgents invoke --message="..."               # single non-interactive turn
```

## API contract

```
POST /api/build.bxs
  { "prompt": "Create an agent that analyzes logs",
    "provider": "", "model": "", "apiKey": "", "maxRepairs": 1, "buildId": "" }
  — or —  { "spec": { agentName, role, instructions, tools[], examplePrompts[] } }
→ {
    "success": true,
    "slug": "log-analyzer-agent",
    "spec": { ... },
    "projectDir": "...",
    "files": [ { "path": "Agent.bx", "content": "..." },
               { "path": "tools/searchLogs.bx", "content": "..." }, ... ],
    "attempts": [ { "attempt": 0, "checkPass": true, "verdict": "PASS", "checkLog": "..." } ]
  }

GET  /api/progress.bxs?buildId=<id>   → { phase, label, ... }   (polled while a build runs)
POST /api/run.bxs      { "slug": "..." }              → { "checkPass": true, "verdict": "PASS", "checkLog": "..." }
POST /api/runLive.bxs  { "slug": "...", "message": "" } → { "passed": true, "output": "...", "message": "..." }
```

`buildId` and `apiKey` are optional — omit `buildId` and the build runs identically
without progress reporting; omit `apiKey` and it uses whatever the environment/config
provides.

## Status

Verified end to end, with and without an API key:

- **No-key path** (`generate.bxs --spec=…`, `testPipeline.bxs`, or the vanilla UI's
  spec mode): Builder → QA (`bxAgents build`) → `PASS`, files render in the BxAgents
  convention. Exercises everything except the LLM.
- **Full path (real key)** — the React demo: Architect → spec → Builder →
  CoderBuilderAgent writes real tool bodies (verified with disk-space / RAM tools
  reading genuine live values via Java interop) → QA → `PASS` → `bxAgents invoke`
  returns a real LLM answer built on that real tool data.
- Tools that genuinely need an external keyed API (news, weather, stock data, …) are
  left with an honest `[NEEDS REAL API]` message, never fabricated numbers.
- Deployable: React frontend on AWS Amplify, BoxLang backend on EC2 behind nginx —
  see `deploy/README.md`.

The default model in `boxlang.json` is pinned to `meta-llama/llama-3.3-70b-instruct`
(still free on OpenRouter) instead of `openrouter/free`: the free rotating pool
returned an empty response mid-demo and crashed bx-ai's response parser rather than
raising a catchable error.

## Known limitations

- **Structural QA only.** `bxAgents build` proves the framework accepts the project;
  a free *functional* test needs `bxAgents test` → TestBox → a working CommandBox,
  which wasn't reliably available. Functional verification is the optional real
  `bxAgents invoke` call (spends a provider call).
- **Single-agent output.** The Architect can *describe* a multi-specialist agent, but
  the Renderer emits one flat `Agent.bx`; the model expresses "delegation" as stub
  tools named `delegateToX`. Real `subAgents` wiring is not implemented.
- **CoderBuilderAgent turn cap.** It passes `maxInteractions` to `agent.run()`, which
  bx-ai currently ignores — the effective bound is the model's own stopping plus
  `max_tokens: 4000`. `MaxToolCallsMiddleware` is the correct fix.
- **`readErrors` tool** reads a shared state struct nothing writes to; the Coder gets
  build errors from `runProject`'s return value instead, so the tool is currently inert.

## Next

- [ ] Real `subAgents` output — Renderer + prompt schema — when the problem needs specialists
- [ ] Typed structured output (`returnFormat: <class>`) instead of `returnFormat: "json"` + `coerce()`
- [ ] `MaxToolCallsMiddleware` on the Coder agent; wire `readErrors` to live state
- [ ] `bxAgents test` as the free functional QA step once CommandBox is reliable
- [ ] RAG over `bx-ai-intro/examples/` — closest examples as few-shot for tool bodies
- [x] Live build-progress bar (polling `GET /api/progress.bxs`)
