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

# The Validator shells out to boxlang; make sure it can find it from inside the JVM.
$env:BOXLANG_BIN = if (Get-Command boxlang -ErrorAction SilentlyContinue) { "boxlang" } else { "C:\boxlang\bin\boxlang.bat" }

$ms = if (Get-Command boxlang-miniserver -ErrorAction SilentlyContinue) { "boxlang-miniserver" } else { "C:\boxlang\bin\boxlang-miniserver.bat" }

Set-Location $root
& $ms "$root\miniserver.json" -c "$root\boxlang.json"
