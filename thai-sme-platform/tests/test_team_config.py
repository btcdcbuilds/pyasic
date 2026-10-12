from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
BUILT_IN = {"multi_agent_collaboration"}  # ships with QwenPaw


def test_every_roster_skill_exists():
    team = yaml.safe_load((ROOT / "agents" / "team.yaml").read_text(encoding="utf-8"))
    for agent in team["agents"]:
        for skill in agent["skills"]:
            if skill in BUILT_IN:
                continue
            assert (ROOT / "skills" / skill / "SKILL.md").is_file(), (agent["id"], skill)


def test_skill_front_matter_has_name_and_description():
    for skill_md in (ROOT / "skills").glob("*/SKILL.md"):
        text = skill_md.read_text(encoding="utf-8")
        front = yaml.safe_load(text.split("---")[1])
        assert front["name"] == skill_md.parent.name
        assert front["description"]
