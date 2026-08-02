Checkpoint before adding a GitHub-hosted workflow trigger monitor.

Current production workflow: .github/workflows/career-os-mac-production.yml
Current head: bebd0907a7de25b5d70f50e282f578643901a1cb
Observed condition: Vercel checks succeed, but issue #49 receives no start/completion event for the self-hosted Mac workflow. The production workflow correctly declares push on main and workflow_dispatch, so the likely bottleneck is runner availability before the first job step.

Planned change: add a lightweight GitHub-hosted monitor that posts workflow acceptance evidence to issue #49 on every main push and manual dispatch. This does not run production or alter submission gates.
