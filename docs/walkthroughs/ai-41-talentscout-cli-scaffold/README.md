# AI-41 — TalentScout CLI scaffold

The Week 2 CLI chatbot now has its own repository, `../talentscout-cli`, rather than an `apps/cli`
workspace inside this monorepo: Day 4 of the programme practises switching between workspaces, which
is only a real exercise when the two are genuinely separate — own lockfile, own lint and TypeScript
rules, own CLAUDE.md. The new repo holds a TypeScript skeleton that runs under `tsx`, prints usage
for `--help`, and exits non-zero on an unknown flag, verified from a clean clone. The only change in
_this_ repository is one README section recording why the split exists, because the README
previously argued the other way.

**How to use this folder:** open `walkthrough.html` in a browser (double-click — it is one file with
no external assets, so it works offline and pastes into Slack or Notion). `plan.md` has the executed
plan, the decisions log, and how the one escalation was resolved (the CLI repo is public); the full hardened spec is at
[`docs/specs/ai-41-talentscout-cli-scaffold.md`](../../specs/ai-41-talentscout-cli-scaffold.md).
