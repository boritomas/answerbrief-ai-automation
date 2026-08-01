Backup checkpoint before changing the Mac production workflow to self-heal package-lock.json.

Source main commit: 12381c0fd5da8c7293dc7a70edd944f60a7ab0a6
Workflow blob before change: 5374f47f7e12ddd5e0ca9efa2af431ab8c357ccc
Reason: package.json includes MCP/OpenHands dependencies missing from package-lock.json, causing npm ci to fail before validation and canary execution.
