#!/usr/bin/env bash
# Start the Agent Factory API + UI on http://127.0.0.1:8080
set -e
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

load_env() {
	[ -f "$1" ] || return 0
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in ''|'#'*) continue ;; esac
		key="${line%%=*}"; val="${line#*=}"
		val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
		export "${key// /}=$val"
	done < "$1"
}
load_env "$HOME/.box.env"
load_env "$root/.env"
export BOXLANG_BIN="${BOXLANG_BIN:-boxlang}"

cd "$root"
exec "${BOXLANG_MINISERVER_BIN:-boxlang-miniserver}" "$root/miniserver.json" -c "$root/boxlang.json"
