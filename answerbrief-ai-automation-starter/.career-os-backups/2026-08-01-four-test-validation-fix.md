Checkpoint before fixing the four deterministic validation failures from Mac canary run 30722112620.

Base commit: b60d9ee0e468e30f793b64cf666bd38f67b48f8f
Failures:
1. Control-plane test resolves repository-root workflow from the canonical nested runtime.
2. Control-plane test resolves repository-root installer from the canonical nested runtime.
3. Controlled browser verification unnecessarily attempts Playwright discovery after CDP already proves an expected-tenant sign-in page.
4. OpenHands command expectation omits current noninteractive JSON flags.

Planned fix: make repository-root fixture reads explicit and environment-aware, return verified sign-in fallback before Playwright attachment, and update the OpenHands command contract test.
