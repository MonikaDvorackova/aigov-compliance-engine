function normalizeBaseUrl(baseUrl) {
  const v = String(baseUrl || "").trim();
  if (!v) return "";
  return v.replace(/\/+$/, "");
}

function formatMissingEvidence(missing) {
  if (!Array.isArray(missing) || missing.length === 0) return "";
  const lines = [];
  for (const item of missing) {
    if (item && typeof item === "object") {
      const code = typeof item.code === "string" ? item.code : "";
      const source = typeof item.source === "string" ? item.source : "";
      if (code || source) {
        lines.push(`- code=${code || "?"} source=${source || "?"}`);
        continue;
      }
    }
    lines.push(`- ${JSON.stringify(item)}`);
  }
  return lines.join("\n");
}

async function fetchComplianceSummary({ runId, baseUrl, apiKey, fetchImpl }) {
  const fetchFn = fetchImpl || fetch;
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error("Missing base_url");
  if (!runId || !String(runId).trim()) throw new Error("Missing run_id");

  const url = new URL(`${base}/compliance-summary`);
  url.searchParams.set("run_id", String(runId));

  const headers = { accept: "application/json" };
  if (apiKey && String(apiKey).trim()) {
    headers.authorization = `Bearer ${String(apiKey).trim()}`;
  }

  const resp = await fetchFn(url.toString(), { method: "GET", headers });
  const text = await resp.text();

  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const msg =
      (json && typeof json === "object" && (json.error || json.message)) ||
      (text ? text.slice(0, 2000) : `HTTP ${resp.status}`);
    const e = new Error(`GovAI compliance-summary HTTP error: ${resp.status} ${msg}`);
    e.status = resp.status;
    e.body = json ?? text;
    throw e;
  }

  if (!json || typeof json !== "object") {
    const e = new Error("GovAI compliance-summary returned non-JSON body");
    e.body = text;
    throw e;
  }

  return json;
}

async function evaluateComplianceGate({ runId, baseUrl, apiKey, fetchImpl }) {
  const summary = await fetchComplianceSummary({ runId, baseUrl, apiKey, fetchImpl });

  const ok = summary.ok;
  const verdictRaw =
    typeof summary.verdict === "string"
      ? summary.verdict
      : typeof summary.decision === "string"
        ? summary.decision
        : "";
  const verdict = typeof verdictRaw === "string" ? verdictRaw.trim() : "";
  const missingEvidence = summary.missing_evidence;

  const printable = {
    run_id: summary.run_id ?? runId,
    schema_version: summary.schema_version,
    verdict: verdict || undefined,
    ok: ok,
  };

  const apiError =
    ok === false
      ? typeof summary.error === "string"
        ? summary.error
        : typeof summary.message === "string"
          ? summary.message
          : "ok:false"
      : null;

  return {
    summary,
    verdict,
    apiError,
    missingEvidenceText: formatMissingEvidence(missingEvidence),
    printable,
  };
}

module.exports = {
  evaluateComplianceGate,
  fetchComplianceSummary,
};

