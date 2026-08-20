/**
 * wf-contract — preflight check on `workflow` tool calls.
 *
 * Attaches at `tool_call` because that is the only hook that fires BEFORE
 * `background: true` (the workflow tool's default) detaches the run — the last
 * moment a human can still be asked (D17).
 *
 * The rules are NOT reimplemented here: this shells out to `bin/wf-contract.mjs
 * check - --json` on stdin (D18). One implementation, and the extension exercises
 * the exact path CI runs.
 * `ponytail:` ceiling is a ~40ms node boot per workflow start. Upgrade path:
 * in-process import once acorn resolution from ~/.pi/agent/extensions/ is proven.
 *
 * KNOWN HOLE (D20): slash-, saved- and builtin-command workflow starts call
 * startInBackground directly and emit no tool_call. They are NOT gated in v1.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "wf-contract.mjs");

type Report = {
  blocked: boolean;
  findings: { id: string; sev: string; msg: string }[];
  summary: string[] | null;
  dag: string[] | null;
};

function runCli(script: string, signal?: AbortSignal): Promise<Report | null> {
  return new Promise((resolve) => {
    if (!existsSync(CLI)) return resolve(null); // not installed → do not block
    const child = execFile(
      process.execPath,
      [CLI, "check", "-", "--json"],
      { maxBuffer: 8 << 20, signal },
      (_err, stdout) => {
        try {
          resolve(JSON.parse(stdout) as Report);
        } catch {
          resolve(null); // CLI itself broke — fail open, never wedge the harness
        }
      },
    );
    child.stdin?.end(script);
  });
}

const render = (r: Report) =>
  [...(r.dag ?? []), "", ...(r.summary ?? []), "", ...r.findings.map((f) => `${f.sev === "block" ? "✗" : "⚠"} ${f.id}  ${f.msg}`)].join("\n");

export default function activate(pi: ExtensionAPI) {
  pi.registerFlag("wf-contract-yes", {
    description: "Approve wf-contract preflight without prompting (CI)",
    type: "boolean",
    default: false,
  });

  pi.on("tool_call", async (event, ctx: ExtensionContext) => {
    if (event.toolName !== "workflow") return;

    // Untrusted input: only a literal inline script is checkable here. A named
    // saved workflow is resolved by the harness, not by us — pass it through
    // rather than guess at a path (D20 hole, documented).
    const script = (event.input as { script?: unknown })?.script;
    if (typeof script !== "string" || !script.trim()) return;

    const report = await runCli(script, ctx.signal);
    if (!report) return;

    const blocks = report.findings.filter((f) => f.sev === "block");
    const warns = report.findings.filter((f) => f.sev === "warn");
    if (!blocks.length && !warns.length) return;

    // D19: --wf-contract-yes → WF_CONTRACT_APPROVE=1 → allowlist (consumed in the CLI).
    const approved = pi.getFlag("wf-contract-yes") === true || process.env.WF_CONTRACT_APPROVE === "1";

    if (blocks.length && !approved) {
      // Full report as the block reason so the model can fix the script this turn.
      return { block: true, reason: `wf-contract preflight BLOCKED\n\n${render(report)}` };
    }

    if (approved) return;

    // warns only: still requires a human (D08).
    if (!ctx.hasUI) {
      return { block: true, reason: `wf-contract preflight needs approval — pass --wf-contract-yes or WF_CONTRACT_APPROVE=1\n\n${render(report)}` };
    }
    const ok = await ctx.ui.confirm("wf-contract preflight", render(report));
    if (!ok) return { block: true, reason: "wf-contract preflight declined" };
  });
}
