#!/usr/bin/env bash
# Bootstraps a fresh Ubuntu 22.04+ EC2 / Lightsail instance to run the Agent
# Factory backend. Idempotent - safe to re-run.
#
# Usage (as the deploy user, repo already cloned to $HOME/BlueHats):
#   cd BlueHats/deploy && ./setup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Installing BoxLang (runtime + MiniServer + install-bx-module)"
/bin/bash -c "$(curl -fsSL https://install.boxlang.io)" -- --with-jre --yes

# Installer PATH entries land in ~/.local/bin - make them available to this
# script and to the systemd service (see agent-factory.service's Environment=).
export PATH="$HOME/.local/bin:$PATH"

echo "==> Installing bx-ai"
install-bx-module bx-ai

# bx-agents' own transitive deps declare caret-range versions
# (qb@^13.1.0, cbpaginator@^2.4.0, cbauth@^5.0.3, cbstorages@^2.0.0) that
# install-bx-module cannot always resolve automatically - it tries to
# literally download that range string instead of resolving it to a real
# version first. Pin each to a concrete version known to work; if any of
# these 404 by the time you run this, look up current versions at
# https://www.forgebox.io/api/v1/entry/<name>/versions and swap them in.
echo "==> Installing bx-agents' transitive dependencies (pinned)"
install-bx-module qb@13.2.1
install-bx-module cbpaginator@2.8.3
install-bx-module cbauth@5.0.7
install-bx-module cbstorages@2.6.1+7

echo "==> Installing bx-agents"
install-bx-module bx-agents

echo "==> Verifying with the repo's own no-key smoke test"
cd "$REPO_ROOT"
boxlang --bx-config boxlang.json backend/testPipeline.bxs

echo
echo "==> Done. Next steps:"
echo "  1. sudo cp deploy/agent-factory.service /etc/systemd/system/"
echo "  2. sudo systemctl daemon-reload && sudo systemctl enable --now agent-factory"
echo "  3. Put nginx + certbot in front (see deploy/README.md) before exposing this publicly."
