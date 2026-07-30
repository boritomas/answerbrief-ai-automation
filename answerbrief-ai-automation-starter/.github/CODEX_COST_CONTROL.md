# Codex Cost Control

Use ChatGPT GitHub-connected execution for repository inspection, targeted code edits, branches, commits, pull requests, and CI review.

Use Codex only when a task requires the local macOS runtime, authenticated browser sessions, Workday interaction, local secrets, or full local integration testing.

Before any Codex run:

1. Provide a bounded file list.
2. Provide one executable objective.
3. Prohibit architecture changes and unrelated refactors.
4. Require stop-after-first-blocker behavior.
5. Set a validation limit to targeted tests first; run the full suite only once after changes stabilize.
6. Require a checkpoint commit before broad changes.

Do not use Codex for planning, repository exploration, repeated summaries, or open-ended autonomous implementation.
