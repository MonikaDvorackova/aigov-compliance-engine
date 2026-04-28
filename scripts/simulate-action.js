const { evaluateComplianceGate } = require("../src/check");

async function main() {
  const runId = process.env.GOVAI_RUN_ID || process.env.RUN_ID;
  const baseUrl = process.env.GOVAI_AUDIT_BASE_URL || process.env.GOVAI_BASE_URL;
  const apiKey = process.env.GOVAI_API_KEY;

  if (!runId || !String(runId).trim()) {
    console.error("missing GOVAI_RUN_ID (or RUN_ID)");
    process.exit(2);
  }
  if (!baseUrl || !String(baseUrl).trim()) {
    console.error("missing GOVAI_AUDIT_BASE_URL (or GOVAI_BASE_URL)");
    process.exit(2);
  }
  if (!apiKey || !String(apiKey).trim()) {
    console.error("missing GOVAI_API_KEY");
    process.exit(2);
  }

  const r = await evaluateComplianceGate({ runId, baseUrl, apiKey });
  console.log(JSON.stringify({ verdict: r.verdict, ok: r.summary.ok, run_id: r.summary.run_id }, null, 2));

  if (r.apiError) {
    console.error(`api_error=${r.apiError}`);
    process.exit(2);
  }

  if (!r.verdict) {
    console.error("missing verdict/decision in response");
    process.exit(2);
  }
  if (!["VALID", "BLOCKED", "INVALID"].includes(r.verdict)) {
    console.error(`unknown verdict=${r.verdict}`);
    process.exit(2);
  }

  if (r.verdict === "VALID") process.exit(0);
  if (r.verdict === "BLOCKED" && r.missingEvidenceText) {
    console.error("missing_evidence:");
    console.error(r.missingEvidenceText);
  }
  process.exit(2);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(2);
});

