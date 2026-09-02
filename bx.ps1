# Wrapper: load .env, then run boxlang with THIS repo's boxlang.json.
# The raw CLI does not auto-load a project boxlang.json, and its own .env
# loader is unreliable on Windows CMD - so we do both here.
#
#   .\bx.ps1 src\smoke.bxs
#   .\bx.ps1 src\agent.bxs profiler\examples\fib.py
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Import-EnvFile($path) {
	if (-not (Test-Path $path)) { return }
	Get-Content $path | ForEach-Object {
		$line = $_.Trim()
		if ($line -eq "" -or $line.StartsWith("#")) { return }
		$eq = $line.IndexOf("=")
		if ($eq -lt 1) { return }
		$name = $line.Substring(0, $eq).Trim()
		$value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
		[Environment]::SetEnvironmentVariable($name, $value, "Process")
	}
}

Import-EnvFile (Join-Path $HOME ".box.env")
Import-EnvFile (Join-Path $root ".env")

$boxlang = if (Get-Command boxlang -ErrorAction SilentlyContinue) { "boxlang" } else { "C:\boxlang\bin\boxlang.bat" }
& $boxlang --bx-config "$root\boxlang.json" @args
exit $LASTEXITCODE
