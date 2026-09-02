import { useState } from 'react'

function BuildResult({ report }) {
  const { success, spec, slug, files, attempts } = report
  const verdict = attempts?.[attempts.length - 1]?.verdict ?? (success ? 'PASS' : 'FAIL')
  const [activeFile, setActiveFile] = useState(files?.[0]?.path ?? null)
  const selected = files?.find((f) => f.path === activeFile)

  const [playgroundOutput, setPlaygroundOutput] = useState('')
  const [playgroundBusy, setPlaygroundBusy] = useState(false)

  async function runMock() {
    setPlaygroundBusy(true)
    setPlaygroundOutput('running `bxAgents build`…')
    try {
      const res = await fetch('/api/run.bxs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const v = await res.json()
      setPlaygroundOutput(
        `verdict: ${v.verdict}\ncheck: ${v.checkPass}\n\n--- bxAgents build ---\n${v.checkLog || ''}`
      )
    } catch (err) {
      setPlaygroundOutput('request failed: ' + err.message)
    } finally {
      setPlaygroundBusy(false)
    }
  }

  async function runLive() {
    setPlaygroundBusy(true)
    setPlaygroundOutput('calling the real provider… (can take up to a minute)')
    try {
      const res = await fetch('/api/runLive.bxs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const v = await res.json()
      setPlaygroundOutput(
        v.error ? `error: ${v.error}` : `passed: ${v.passed}\n\n--- live run ---\n${v.output || ''}`
      )
    } catch (err) {
      setPlaygroundOutput('request failed: ' + err.message)
    } finally {
      setPlaygroundBusy(false)
    }
  }

  return (
    <div className="w-full rounded-3xl bg-white/15 p-8 text-left shadow-lg backdrop-blur">
      {/* header row — verdict badge color/shape lives here */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">{slug}</p>
          <h2 className="font-serif text-3xl font-semibold text-brand-ink">
            {spec?.agentName ?? 'Your agent'}
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold text-white ${
            success ? 'bg-accent' : 'bg-red-500/80'
          }`}
        >
          {verdict}
        </span>
      </div>

      {spec?.role && <p className="mt-3 text-brand-ink/80">{spec.role}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* blueprint panel: spec summary + tools table */}
        {spec && (
          <div className="rounded-2xl bg-brand-ink/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
              Blueprint
            </p>

            <dl className="mt-3 space-y-1 text-sm text-brand-ink">
              <div className="flex gap-2">
                <dt className="font-semibold">agent</dt>
                <dd>{spec.agentName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold">memory</dt>
                <dd>{spec.memoryType || 'window'}</dd>
              </div>
            </dl>

            {spec.instructions && (
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white/40 p-3 font-mono text-xs text-brand-ink">
                {spec.instructions}
              </pre>
            )}

            {!!spec.tools?.length && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-brand-ink/60">
                      <th className="pb-1 pr-2">Tool</th>
                      <th className="pb-1 pr-2">Params</th>
                      <th className="pb-1">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-brand-ink/90">
                    {spec.tools.map((t) => (
                      <tr key={t.name} className="border-t border-brand-ink/10 align-top">
                        <td className="py-2 pr-2 font-mono text-xs">{t.name}</td>
                        <td className="py-2 pr-2 font-mono text-xs text-brand-ink/60">
                          {(t.params || []).map((p) => p.name).join(', ') || '—'}
                        </td>
                        <td className="py-2 text-brand-ink/80">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* generated files panel: tabs + code viewer. Code wraps instead of
            scrolling sideways — only the vertical scrollbar (max-h + overflow-y) applies. */}
        {!!files?.length && (
          <div className="rounded-2xl bg-brand-ink/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
              Generated files
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setActiveFile(f.path)}
                  className={`rounded-full px-3 py-1 font-mono text-xs transition ${
                    activeFile === f.path
                      ? 'bg-accent text-white'
                      : 'bg-white/40 text-brand-ink hover:bg-white/70'
                  }`}
                >
                  {f.path}
                </button>
              ))}
            </div>
            {selected && (
              <pre className="mt-3 max-h-80 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-xl bg-brand-ink p-4 font-mono text-xs text-white/90">
                {selected.content}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* playground: re-run QA for free, or call the real provider */}
      {slug && (
        <div className="mt-6 rounded-2xl bg-brand-ink/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
            Playground
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runMock}
              disabled={playgroundBusy}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
            >
              Re-check build (free, no API key)
            </button>
            <button
              type="button"
              onClick={runLive}
              disabled={playgroundBusy}
              className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
            >
              Run (real LLM — uses your API key)
            </button>
          </div>
          {playgroundOutput && (
            <pre className="mt-3 max-h-64 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-xl bg-brand-ink p-4 font-mono text-xs text-white/90">
              {playgroundOutput}
            </pre>
          )}
        </div>
      )}

      {!!attempts?.length && (
        <div className="mt-6 rounded-2xl bg-brand-ink/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
            Attempts
          </p>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white/40 p-3 font-mono text-xs text-brand-ink">
            {attempts
              .map(
                (a) =>
                  `attempt ${a.attempt}  check=${a.checkPass ? 'ok' : 'FAIL'}` +
                  (a.verdict === 'PASS' ? '' : `\n  ${(a.checkLog || '').split('\n').join('\n  ')}`)
              )
              .join('\n\n')}
          </pre>
        </div>
      )}

      {!!spec?.examplePrompts?.length && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
            Try asking it
          </p>
          <ul className="mt-2 space-y-1">
            {spec.examplePrompts.map((p) => (
              <li key={p} className="text-sm text-brand-ink/80">
                “{p}”
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default BuildResult
