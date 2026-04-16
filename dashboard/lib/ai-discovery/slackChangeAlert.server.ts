import type { DiscoveryCategoryCounts } from "./scanChangeSummary";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

import { resolveAiDiscoveryHistoryPageUrl } from "./aiDiscoveryAppBaseUrl.server";

function formatCountLine(label: string, c: DiscoveryCategoryCounts): string {
  return `${label}: OpenAI ${c.openai} · Transformers ${c.transformers} · Artifacts ${c.modelArtifacts} · Combined ${c.combinedFolders}`;
}

function buildSlackPayload(scan: StoredDiscoveryScan): {
  text: string;
  blocks: Record<string, unknown>[];
} {
  const cs = scan.changeSummary;
  if (!cs) {
    throw new Error("changeSummary required for Slack alert");
  }

  const ts = scan.createdAt;
  let when = ts;
  try {
    when = new Date(ts).toISOString();
  } catch {
    /* keep raw */
  }

  const target = scan.scheduledTargetId?.trim() || "—";
  const root = scan.scanRoot;
  const proj = scan.projectId?.trim();
  const repo = scan.repoUrl?.trim();
  const branch = scan.branch?.trim();
  const sha = scan.commitSha?.trim();

  const refParts: string[] = [];
  if (branch) refParts.push(branch);
  if (sha) refParts.push(sha.length > 12 ? `${sha.slice(0, 12)}…` : sha);
  const refLine = refParts.length > 0 ? refParts.join(" @ ") : "—";

  const historyUrl = resolveAiDiscoveryHistoryPageUrl();

  const added = formatCountLine("Added", cs.addedCounts);
  const removed = formatCountLine("Removed", cs.removedCounts);

  const metaLines: string[] = [
    `*Target:* \`${target}\``,
    `*Scan root:* \`${root}\``,
    `*Time:* ${when}`,
  ];
  if (proj) metaLines.push(`*Project:* ${proj}`);
  if (repo) metaLines.push(`*Repo:* ${repo}`);
  metaLines.push(`*Ref:* ${refLine}`);

  const bodyMrkdwn = metaLines.join("\n");

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "AI Discovery — scheduled change detected", emoji: false },
    },
    { type: "section", text: { type: "mrkdwn", text: bodyMrkdwn } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Added signals (counts)*\n${added}\n\n*Removed signals (counts)*\n${removed}`,
      },
    },
  ];

  if (historyUrl) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${historyUrl}|Open AI Discovery history>`,
      },
    });
  }

  const fallback = `AI Discovery: change detected — target ${target}, root ${root}, ${when}`;

  return { text: fallback, blocks };
}

/**
 * POSTs to a Slack incoming webhook. Does not throw on HTTP errors — caller may check response.
 */
export async function sendAiDiscoveryChangeAlertToSlack(
  webhookUrl: string,
  scan: StoredDiscoveryScan
): Promise<{ ok: boolean; status: number; errorText?: string }> {
  const payload = buildSlackPayload(scan);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const status = res.status;
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return { ok: false, status, errorText: errorText || res.statusText };
  }
  return { ok: true, status };
}
