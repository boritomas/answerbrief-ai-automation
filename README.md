You are working in the `boritomas/answerbrief-ai-automation` repo.

Goal:
Review the current repo and make the MVP buildable as a clean Next.js app for AnswerBrief AI.

Business context:
AnswerBrief AI is a small service that provides role-specific interview prep for telecom, federal, finance, audit, compliance, operations, product, and leadership candidates.

Product promise:
Resume + job posting in. Interview brief out.

First task:
Audit the repo structure and fix anything that prevents the app from installing, building, or running locally.

Please do the following:

1. Inspect the file structure.
2. Confirm this is a valid Next.js app.
3. Fix any broken imports, server action issues, TypeScript errors, package issues, or routing problems.
4. Keep the site simple.
5. Do not add complex architecture.
6. Do not add paid services beyond Stripe placeholders.
7. Keep all secrets in environment variables.
8. Do not commit any real API keys.
9. Keep the business guardrails:

   * No Verizon confidential material
   * No employer-confidential customer uploads
   * No job guarantee language
   * No collection of SSNs, passwords, bank data, or sensitive documents

Acceptance criteria:

* `npm install` works
* `npm run build` works
* Home page loads
* Package cards display correctly
* Stripe checkout route exists but uses environment variables
* Privacy page exists
* README explains local setup
* Any changes are opened as a pull request with a short summary of what changed
