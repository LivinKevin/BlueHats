# Start the Agent Factory API + UI on http://127.0.0.1:8080
#   UI:      http://127.0.0.1:8080/
#   health:  http://127.0.0.1:8080/api/health.bxm
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Import-EnvFile($path) {
	if (-not (Test-Path $path)) { return }
	Get-Content $path | ForEach-Object {
		$line = $_.Trim()
		if ($line -eq "" -or $line.StartsWith("#")) { return }
		$eq = $line.IndexOf("=")
		if ($eq -lt 1) { return }
		[Environment]::SetEnvironmentVariable(
			$line.Substring(0, $eq).Trim(),
			$line.Substring($eq + 1).Trim().Trim('"').Trim("'"),
			"Process")
	}
}
Import-EnvFile (Join-Path $HOME ".box.env")
Import-EnvFile (Join-Path $root ".env")

# The Validator shells out to boxlang via Java's ProcessBuilder, which can't resolve a
# bare "boxlang" the way a shell would - it needs the actual resolved file (with
# extension). Use whatever PATH resolves to, falling back to the default bvm install path.
$boxlangCmd = Get-Command boxlang -ErrorAction SilentlyContinue
$env:BOXLANG_BIN = if ($boxlangCmd) { $boxlangCmd.Source } else { "C:\boxlang\bin\boxlang.bat" }

# Same story for bxAgents - its shim isn't even on PATH by default (it lives under
# the BoxLang home, not the bin dir PATH points at), so resolve it explicitly.
$bxAgentsCmd = Get-Command bxAgents -ErrorAction SilentlyContinue
$env:BXAGENTS_BIN = if ($bxAgentsCmd) { $bxAgentsCmd.Source } else { "C:\boxlang\home\bin\bxAgents.bat" }

$ms = if (Get-Command boxlang-miniserver -ErrorAction SilentlyContinue) { "boxlang-miniserver" } else { "C:\boxlang\bin\boxlang-miniserver.bat" }

Set-Location $root
& $ms "$root\miniserver.json" -c "$root\boxlang.json"
