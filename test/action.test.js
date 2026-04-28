const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateComplianceGate } = require("../src/check");

function fakeFetch({ status = 200, body }) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body == null ? "" : JSON.stringify(body);
    },
  });
}

test("passes only when verdict VALID", async () => {
  const r = await evaluateComplianceGate({
    runId: "r1",
    baseUrl: "http://example.test",
    apiKey: "k",
    fetchImpl: fakeFetch({
      body: { ok: true, schema_version: "aigov.compliance_summary.v2", run_id: "r1", verdict: "VALID" },
    }),
  });
  assert.equal(r.verdict, "VALID");
  assert.equal(r.apiError, null);
});

test("blocked prints missing_evidence", async () => {
  const r = await evaluateComplianceGate({
    runId: "r2",
    baseUrl: "http://example.test",
    apiKey: "k",
    fetchImpl: fakeFetch({
      body: {
        ok: true,
        schema_version: "aigov.compliance_summary.v2",
        run_id: "r2",
        verdict: "BLOCKED",
        missing_evidence: [{ code: "human_approval", source: "policy" }],
      },
    }),
  });
  assert.equal(r.verdict, "BLOCKED");
  assert.match(r.missingEvidenceText, /human_approval/);
});

test("ok:false is treated as failing API error", async () => {
  const r = await evaluateComplianceGate({
    runId: "missing",
    baseUrl: "http://example.test",
    apiKey: "k",
    fetchImpl: fakeFetch({
      body: { ok: false, error: "run_not_found", schema_version: "aigov.compliance_summary.v2", run_id: "missing" },
    }),
  });
  assert.equal(r.apiError, "run_not_found");
});

test("accepts decision field as verdict equivalent", async () => {
  const r = await evaluateComplianceGate({
    runId: "r3",
    baseUrl: "http://example.test",
    apiKey: "k",
    fetchImpl: fakeFetch({
      body: { ok: true, schema_version: "aigov.compliance_summary.v2", run_id: "r3", decision: "VALID" },
    }),
  });
  assert.equal(r.verdict, "VALID");
});

test("unknown decision/verdict is surfaced", async () => {
  const r = await evaluateComplianceGate({
    runId: "r4",
    baseUrl: "http://example.test",
    apiKey: "k",
    fetchImpl: fakeFetch({
      body: { ok: true, schema_version: "aigov.compliance_summary.v2", run_id: "r4", verdict: "MAYBE" },
    }),
  });
  assert.equal(r.verdict, "MAYBE");
});

