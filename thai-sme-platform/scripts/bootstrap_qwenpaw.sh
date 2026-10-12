#!/usr/bin/env bash
# Sets up QwenPaw with the agent roster in agents/team.yaml and the platform skills.
# Commands follow the QwenPaw 2.2.x docs (website/public/docs/cli.en.md).
# Prereqs: Python 3.11-3.13, an Anthropic API key (Claude Console), NOT a Claude.ai login.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pip install "qwenpaw==2.2.1"
qwenpaw init --defaults

# API key is stored encrypted by QwenPaw; this prompts for it.
qwenpaw models config-key anthropic

# Copy platform skills into the shared skill pool.
POOL="${QWENPAW_WORKING_DIR:-$HOME/.qwenpaw}/skill_pool"
mkdir -p "$POOL"
cp -r "$ROOT"/skills/* "$POOL"/

# Create one agent workspace per roster entry.
python3 - "$ROOT/agents/team.yaml" <<'PY' | while read -r name provider model; do
import sys, yaml
team = yaml.safe_load(open(sys.argv[1]))
for a in team["agents"]:
    print(a["id"], team["provider_id"], a["model"])
PY
  echo "Creating agent $name ($model)"
  qwenpaw agents create --name "$name" --provider-id "$provider" --model-id "$model"
done

cat <<'EOF'

Manual steps remaining (see docs/SETUP.md):
  1. Console -> Settings -> Models -> Anthropic -> Add Model for claude-opus-5-5,
     claude-sonnet-5-5 and claude-haiku-5-5 if they are not listed.
  2. Console -> Workspace -> Skills: load each agent's skills from the pool
     (the list per agent is in agents/team.yaml).
  3. Start: qwenpaw app   (console at http://127.0.0.1:8088)
EOF
