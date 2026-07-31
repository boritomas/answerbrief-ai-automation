import test from "node:test";
import assert from "node:assert/strict";
import {
  companyMemoryKey,
  createCompanyMemory,
  canReuseCompanyMemory,
  rankCompanyMemories,
  selectCompanyMemory,
} from "../../scripts/lib/career-os-company-memory.mjs";

test("builds a stable company/ATS memory key", () => {
  assert.equal(companyMemoryKey({ company: "Verizon", ats: "Workday", host: "verizon.wd5.myworkdayjobs.com" }), "verizon::workday::verizon-wd5-myworkdayjobs-com");
});

test("learns only from confirmed outcomes and preserves prior knowledge", () => {
  const first = createCompanyMemory({ company: "Verizon", ats: "Workday", host: "verizon.wd5.myworkdayjobs.com", selectors: { resume: "input[type=file]" }, fieldMappings: { firstName: "legalName.firstName" }, requiredQuestions: ["sponsorship"], submissionConfirmed: true });
  const second = createCompanyMemory({ company: "Verizon", ats: "Workday", host: "verizon.wd5.myworkdayjobs.com", selectors: { submit: "button[data-automation-id=bottom-navigation-next-button]" }, confirmationPatterns: ["application submitted"], submissionConfirmed: true }, first);
  assert.equal(second.successfulSubmissions, 2);
  assert.equal(second.selectors.resume, "input[type=file]");
  assert.ok(second.selectors.submit);
  assert.deepEqual(second.requiredQuestions, ["sponsorship"]);
  assert.equal(canReuseCompanyMemory(second), true);
});

test("does not reuse memory without a confirmed successful submission", () => {
  const memory = createCompanyMemory({ company: "Example", ats: "Greenhouse", selectors: { submit: "button" }, failed: true });
  assert.equal(canReuseCompanyMemory(memory), false);
});

test("prefers exact company and ATS memory over generic ATS memory", () => {
  const generic = createCompanyMemory({ company: "Other", ats: "Workday", host: "other.wd5.myworkdayjobs.com", selectors: { submit: "button" }, submissionConfirmed: true });
  const exact = createCompanyMemory({ company: "Verizon", ats: "Workday", host: "verizon.wd5.myworkdayjobs.com", selectors: { submit: "button[data-automation-id=bottom-navigation-next-button]" }, submissionConfirmed: true });
  const ranked = rankCompanyMemories([generic, exact], { company: "Verizon", ats: "Workday", host: "verizon.wd5.myworkdayjobs.com" });
  assert.equal(ranked[0].memory.key, exact.key);
  assert.equal(selectCompanyMemory([generic, exact], { company: "Verizon", ats: "Workday", host: "verizon.wd5.myworkdayjobs.com" }).key, exact.key);
});
