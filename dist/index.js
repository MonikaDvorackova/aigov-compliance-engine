const { evaluateComplianceGate } = require("../src/check");

function getInput(name, { required } = { required: false }) {
  const key = `INPUT_${String(name).toUpperCase().replace(/ /g, "_")}`;
  const v = process.env[key];
  const out = typeof v === "string" ? v : "";
  if (required && !out.trim()) {
    throw new Error(`Missing required input: ${name}`);
  }
  return out;
}

function info(msg) {
  process.stdout.write(`${msg}\n`);
}

function error(msg) {
  process.stdout.write(`::error::${msg}\n`);
}

async function run() {
  const runId = getInput("run_id", { required: true });
  const baseUrl = getInput("base_url", { required: true });
  const apiKey = getInput("api_key", { required: true });

  info(`GovAI gate: GET /compliance-summary?run_id=${runId}`);
  info(`GovAI base_url: ${String(baseUrl).replace(/\/+$/, "")}`);

  let result;
  try {
    result = await evaluateComplianceGate({ runId, baseUrl, apiKey });
  } catch (e) {
    error(e && e.message ? e.message : String(e));
    process.exitCode = 1;
    return;
  }

  info(`GovAI summary: ${JSON.stringify(result.printable)}`);

  if (result.apiError) {
    error(`GovAI compliance gate failed: api_error=${result.apiError}`);
    process.exitCode = 1;
    return;
  }

  if (!result.verdict) {
    error("GovAI compliance gate failed: missing verdict/decision in response");
    process.exitCode = 1;
    return;
  }

  const known = new Set(["VALID", "BLOCKED", "INVALID"]);
  if (!known.has(result.verdict)) {
    error(`GovAI compliance gate failed: unknown verdict=${result.verdict}`);
    process.exitCode = 1;
    return;
  }

  if (result.verdict === "VALID") {
    info("GovAI compliance gate PASSED: verdict=VALID");
    return;
  }

  if (result.verdict === "BLOCKED") {
    if (result.missingEvidenceText) {
      error("GovAI gate BLOCKED: missing_evidence:");
      for (const line of result.missingEvidenceText.split("\n")) {
        error(line);
      }
    } else {
      error("GovAI gate BLOCKED (missing_evidence not provided by server).");
    }
    error("GovAI compliance gate failed: verdict=BLOCKED");
    process.exitCode = 1;
    return;
  }

  error(`GovAI compliance gate failed: verdict=${result.verdict || "INVALID"}`);
  process.exitCode = 1;
}

run().catch((e) => {
  error(e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});

