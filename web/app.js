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

async function build() {
	const btn = $("build");
	btn.disabled = true;
	show("progress");
	["architect", "builder", "qa"].forEach((s) => setStep(s, ""));

	const payload = {
		provider: $("provider").value.trim(),
		model: $("model").value.trim(),
	};
	if ($("specMode").checked) {
		try { payload.spec = JSON.parse($("specInput").value); }
		catch { alert("spec is not valid JSON"); btn.disabled = false; return; }
		setStep("architect", "done");
	} else {
		payload.prompt = $("prompt").value.trim();
		if (!payload.prompt) { btn.disabled = false; return; }
		setStep("architect", "active");
	}
	setStep("builder", "active");

	let report;
	try {
		const res = await fetch("/api/build.bxs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		report = await res.json();
	} catch (e) {
		setStep("builder", "fail");
		$("verdict").innerHTML = `<span class="err">request failed: ${esc(e.message)}</span>`;
		btn.disabled = false;
		return;
	}

	btn.disabled = false;

	if (report.error) {
		setStep("architect", "fail");
		$("verdict").innerHTML = `<span class="err">${esc(report.error)}</span><pre>${esc(report.detail || "")}${esc(report.stack || "")}</pre>`;
		return;
	}

	setStep("architect", "done");
	setStep("builder", "done");
	setStep("qa", report.success ? "done" : "fail");
	currentSlug = report.slug;

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
		`attempt ${a.attempt}  check=${a.checkPass ? "ok" : "FAIL"}  mock=${a.mockPass ? "ok" : "FAIL"}` +
		(a.verdict === "PASS" ? "" : `\n  ${(a.checkPass ? a.mockLog : a.checkLog || "").split("\n").join("\n  ")}`)
	).join("\n\n");
}

async function runMock() {
	if (!currentSlug) return;
	$("run-output").textContent = "running…";
	try {
		const res = await fetch("/api/run.bxs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ slug: currentSlug }),
		});
		const v = await res.json();
		$("run-output").textContent =
			`verdict: ${v.verdict}\ncheck: ${v.checkPass}   mock: ${v.mockPass}\n\n--- mock run ---\n${v.mockLog || ""}`;
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
