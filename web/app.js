const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

$("specMode").addEventListener("change", (e) => {
	$("specInput").classList.toggle("hidden", !e.target.checked);
	$("prompt").classList.toggle("hidden", e.target.checked);
});

$("build").addEventListener("click", build);
$("runMock").addEventListener("click", runMock);
$("runLive").addEventListener("click", runLive);

let currentSlug = null;

function setStep(step, state) {
	document.querySelectorAll(".steps li").forEach((li) => {
		if (li.dataset.step === step) li.className = state;
	});
}

/*
==========================
	Progress Bar
==========================
*/

const CHIP_ORDER = ["architect", "builder", "qa", "coder"];
const PHASE_CHIP = { architect: "architect", builder: "builder", qa: "qa", coder: "coder" };

const isSkipped = (step) => {
	const li = document.querySelector(`.steps li[data-step="${step}"]`);
	return !!li && li.classList.contains("skip");
};

function markPhase(phase) {
	const idx = CHIP_ORDER.indexOf(PHASE_CHIP[phase]);
	if (idx < 0) return;
	CHIP_ORDER.forEach((s, i) => {
		if (isSkipped(s)) return; // setStep() clobbers className, which would drop .skip
		if (i < idx) setStep(s, "done");
		else if (i === idx) setStep(s, "active");
	});
}

const bar = {
	shown: 0, target: 0, ceiling: 90, anim: null, poll: null, misses: 0,

	reset() {
		this.stop();
		this.shown = 0; this.target = 0; this.ceiling = 90; this.misses = 0;
		$("bar").className = "bar";
		$("bar-label").textContent = "Starting…";
		this.paint();
	},

	start(buildId) {
		$("bar").classList.add("running");
		this.anim = setInterval(() => this.step(), 120);
		setTimeout(() => this.startPolling(buildId), 600);
	},

	step() {
		const before = Math.round(this.shown);
		if (this.target - this.shown > 0.15) {
			this.shown += (this.target - this.shown) * 0.12;          // ease toward truth
		} else if (this.shown < this.ceiling) {
			this.shown = Math.max(this.shown, this.target);
			this.shown += Math.max(0.01, (this.ceiling - this.shown) * 0.006);
		}
		this.shown = Math.min(this.shown, Math.max(this.ceiling - 0.3, 0));
		if (Math.round(this.shown) !== before) this.paint();
	},

	paint() {
		const pct = Math.min(100, Math.max(0, this.shown));
		$("bar-fill").style.width = pct.toFixed(1) + "%";
		$("bar-pct").textContent = Math.round(pct) + "%";
		$("bar").setAttribute("aria-valuenow", String(Math.round(pct)));
	},

	setFromServer(rec) {
		if (!rec || rec.state === "unknown") return;
		if (typeof rec.percent === "number") this.target = Math.max(rec.percent, this.shown);
		if (typeof rec.ceiling === "number" && rec.ceiling > 0) this.ceiling = rec.ceiling;
		if (rec.label) $("bar-label").textContent = rec.label;
		if (rec.phase) markPhase(rec.phase);
	},

	startPolling(buildId) {
		if (!this.anim) return; // already finished
		this.poll = setInterval(() => {
			fetch(`/api/progress.bxs?id=${encodeURIComponent(buildId)}`, { cache: "no-store" })
				.then((r) => (r.ok ? r.json() : null))
				.then((rec) => { if (rec) { this.misses = 0; this.setFromServer(rec); } })
				.catch(() => { if (++this.misses >= 3) this.stopPolling(); });
		}, 1200);
	},

	stopPolling() { clearInterval(this.poll); this.poll = null; },

	stop() { this.stopPolling(); clearInterval(this.anim); this.anim = null; },

	finish(ok) {
		this.stop();
		this.target = this.ceiling = this.shown = 100;
		$("bar").classList.remove("running");
		$("bar").classList.add(ok ? "done" : "fail");
		this.paint();
		return new Promise((resolve) => setTimeout(resolve, 380));
	},
};

function newBuildId() {
	const raw = (self.crypto && crypto.randomUUID)
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

async function build() {
	const btn = $("build");
	btn.disabled = true;
	show("progress");
	CHIP_ORDER.forEach((s) => setStep(s, ""));
	bar.reset();
	$("verdict").innerHTML = "";

	const payload = {
		provider: $("provider").value.trim(),
		model: $("model").value.trim(),
	};
	const specMode = $("specMode").checked;
	if (specMode) {
		try { payload.spec = JSON.parse($("specInput").value); }
		catch { alert("spec is not valid JSON"); btn.disabled = false; return; }
		setStep("architect", "skip");
		setStep("coder", "skip");
	} else {
		payload.prompt = $("prompt").value.trim();
		if (!payload.prompt) { btn.disabled = false; return; }
		setStep("architect", "active");
	}

	payload.buildId = newBuildId();
	bar.start(payload.buildId);

	let report;
	try {
		const res = await fetch("/api/build.bxs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		report = await res.json();
	} catch (e) {
		await bar.finish(false);
		setStep("builder", "fail");
		$("verdict").innerHTML = `<span class="err">request failed: ${esc(e.message)}</span>`;
		btn.disabled = false;
		return;
	} finally {
		bar.stop();
	}

	btn.disabled = false;

	if (report.error) {
		await bar.finish(false);
		setStep("architect", "fail");
		$("verdict").innerHTML = `<span class="err">${esc(report.error)}</span><pre>${esc(report.detail || "")}${esc(report.stack || "")}</pre>`;
		return;
	}

	CHIP_ORDER.forEach((s) => { if (!isSkipped(s)) setStep(s, "done"); });
	setStep("qa", report.success ? "done" : "fail");
	currentSlug = report.slug;

	// Let the bar land on 100 before the results appear underneath it.
	$("bar-label").textContent = report.success ? "Done" : "Finished with errors";
	await bar.finish(report.success);

	$("verdict").innerHTML = report.success
		? `<span class="badge pass">PASS</span> ${esc(report.slug)}`
		: `<span class="badge fail">FAIL</span> ${esc(report.slug)} — see attempts`;

	renderBlueprint(report.spec);
	renderFiles(report.files || []);
	renderAttempts(report.attempts || []);
	show("playground");
	$("run-output").textContent = "";
}

function renderBlueprint(spec) {
	if (!spec) return;
	show("blueprint");
	const tools = (spec.tools || []).map((t) => `
		<tr><td><code>${esc(t.name)}</code></td>
		<td>${(t.params || []).map((p) => `<code>${esc(p.name)}</code>`).join(", ") || "—"}</td>
		<td>${esc(t.description)}</td></tr>`).join("");
	$("blueprint-body").innerHTML = `
		<div class="kv"><b>agent</b> ${esc(spec.agentName)}</div>
		<div class="kv"><b>role</b> ${esc(spec.role)}</div>
		<div class="kv"><b>memory</b> ${esc(spec.memoryType || "window")}</div>
		<div class="kv"><b>instructions</b><pre>${esc(spec.instructions)}</pre></div>
		<table><thead><tr><th>Tool</th><th>Params</th><th>Description</th></tr></thead><tbody>${tools}</tbody></table>
		<div class="kv" style="margin-top:.6rem"><b>example prompts</b>
			<ul>${(spec.examplePrompts || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
		</div>`;
}

function renderFiles(files) {
	if (!files.length) return;
	show("files");
	const tabs = $("file-tabs");
	tabs.innerHTML = "";
	files.forEach((f, i) => {
		const b = document.createElement("button");
		b.textContent = f.path;
		b.onclick = () => {
			tabs.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
			b.classList.add("active");
			$("file-content").textContent = f.content;
		};
		tabs.appendChild(b);
		if (i === 0) b.click();
	});
}

function renderAttempts(attempts) {
	if (!attempts.length) return;
	show("attempts");
	$("attempts-body").textContent = attempts.map((a) =>
		`attempt ${a.attempt}  check=${a.checkPass ? "ok" : "FAIL"}` +
		(a.verdict === "PASS" ? "" : `\n  ${(a.checkLog || "").split("\n").join("\n  ")}`)
	).join("\n\n");
}

async function runMock() {
	if (!currentSlug) return;
	$("run-output").textContent = "running `bxAgents build`…";
	try {
		const res = await fetch("/api/run.bxs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ slug: currentSlug }),
		});
		const v = await res.json();
		$("run-output").textContent =
			`verdict: ${v.verdict}\ncheck: ${v.checkPass}\n\n--- bxAgents build ---\n${v.checkLog || ""}`;
	} catch (e) {
		$("run-output").textContent = "request failed: " + e.message;
	}
}

async function runLive() {
	if (!currentSlug) return;
	$("run-output").textContent = "calling the real provider… (can take up to a minute)";
	try {
		const res = await fetch("/api/runLive.bxs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ slug: currentSlug }),
		});
		const v = await res.json();
		$("run-output").textContent = v.error
			? `error: ${v.error}`
			: `passed: ${v.passed}\n\n--- live run ---\n${v.output || ""}`;
	} catch (e) {
		$("run-output").textContent = "request failed: " + e.message;
	}
}
