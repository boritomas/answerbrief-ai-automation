Native merge trigger for the Career OS Mac production canary.

Purpose: create a GitHub-generated merge push on main so the monitored workflow runs independently of connector-originated contents API commits.
Expected evidence: issue #49 receives a hosted workflow acceptance comment, followed by Mac runner start/completion when the self-hosted runner is available.
