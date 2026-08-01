# AnswerBrief Career OS Cloud Transfer

This bundle moves the Next.js application, browser worker, queue/state folders, and production configuration into a Docker-compatible cloud host.

## Create the transfer archive on the Mac

```bash
cd "/Users/tomasnieves/actions-runner/_work/answerbrief-ai-automation/answerbrief-ai-automation/answerbrief-ai-automation-starter"
git pull origin main
chmod +x scripts/package-cloud-transfer.sh scripts/cloud-entrypoint.sh
./scripts/package-cloud-transfer.sh
```

The command prints the generated `.tar.gz` path. The archive excludes secrets and bulky generated dependencies.

## Deploy on a Docker cloud host

```bash
tar -xzf answerbrief-career-os-cloud-*.tar.gz
cd answerbrief-career-os-cloud-*/app
cp ../.env.cloud.example .env.cloud
# Fill .env.cloud securely, then:
docker compose -f docker-compose.cloud.yml up -d --build
```

## Verify production

```bash
curl -fsS http://localhost:3000/api/career-os/worker/health
docker compose -f docker-compose.cloud.yml logs -f career-os
```

## Cloud requirements

- Docker-compatible Linux host
- At least 4 GB RAM; 8 GB recommended for browser automation
- 2 GB shared memory for Chromium
- Persistent Docker volumes
- Outbound HTTPS access
- Secrets entered through the cloud provider secret manager or `.env.cloud` stored only on the host

## Important

Authenticated browser sessions from macOS may not transfer cleanly to Linux. The cloud worker may require one initial sign-in for each employer platform. CAPTCHA, MFA, identity verification, and unresolved legal questions remain human checkpoints.
