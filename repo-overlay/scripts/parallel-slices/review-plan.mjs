#!/usr/bin/env node
// Independent review of a Product Plan, before a human is asked to approve it.
//
// Human approval is the most expensive gate in this system and it was the only
// one nothing checked first. A plan carrying an unsatisfiable requirement, an
// acceptance test no implementation could produce, or two requirements that
// contradict each other reads perfectly well; the contradiction only surfaces
// later, after compilation, after review of the compiled map, and after a human
// has already spent their attention approving it.
//
// This runs the same reviewers, the same response contract, the same isolation
// and the same unanimity rule as every other review, against the plan itself.
// The ordering it restores is the one the sheet queue already argues for:
// machines check what machines are good at, and the human is asked only the
// question a human is good at.
//
//   node scripts/parallel-slices/review-plan.mjs --plan docs/plans/<plan>.md

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

import { loadReviewConfig } from "./review-config.mjs";
import { invokeProvider, preflightProvider } from "./review-providers.mjs";

const EXIT_APPROVED = 0;
const EXIT_CHANGES_REQUESTED = 10;
const EXIT_FAILED = 1;

function repositoryRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  throw new Error(message);
}

export function planReviewArtifactPaths(planPath) {
  const feature = basename(planPath, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const directory = `docs/plans/reviews/${feature}`;
  return {
    feature,
    json: `${directory}/product-plan.json`,
    markdown: `${directory}/product-plan.md`,
    directory,
  };
}

// The plan is fingerprinted so an approval is tied to exact content. Edit the
// plan after approval and the recorded fingerprint no longer matches, which is
// what stops an approved plan being quietly replaced by a different one.
export function planFingerprint(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function packet(planPath, planContents, reviewer) {
  return `# Product Plan review packet

You are reviewer \`${reviewer.id}\` (${reviewer.provider}).

You are reviewing independently. Other reviewers examine the same plan at the
same time, you will not see their conclusions, and they will not see yours.
Every configured reviewer must approve, so one genuine problem is enough to
block, and agreeing with an imagined consensus helps nobody.

This is a **Product Plan**, not an implementation. It has not been approved and
no code exists for it. You are the last check before a human is asked to approve
it, so find what a human reading prose will miss.

## What to check

Read \`${planPath}\` completely. Then read the repository it will be built in:
the root \`AGENTS.md\`, \`docs/project/\`, the installed architecture contracts
under \`.parallel-slices/\`, and any file the plan names. Verify claims against
what is actually there.

Request changes for any of these:

1. **An unsatisfiable requirement.** Acceptance evidence that no implementation
   could ever produce. The sharpest form is evidence requiring the absence of
   something the installed architecture requires to exist.
2. **A requirement with no observable evidence**, or evidence that cannot be
   attributed to any single owner.
3. **Two requirements that contradict each other**, or a requirement that
   contradicts a stated non-goal, preservation invariant or locked decision.
4. **A contradiction with a repository contract**: the root instructions, the
   installed architecture, the documented quality gates, or a policy in
   \`docs/project/\`.
5. **A lifecycle or state machine that cannot be realised** as described,
   including transitions that are unreachable or mutually exclusive.
6. **A definition of done containing an item nothing in the plan delivers.**
7. **Scope that cannot be built in the stated milestone** because it depends on
   something the plan explicitly excludes.

Do not request changes because you would have designed the product differently.
Judge the plan's internal coherence and its fit with this repository, not its
taste. A plan may be ambitious; it may not be self-contradictory.

## Evidence

Every finding needs a precise repository-relative path and line. For a finding
about the plan, cite the plan. For a finding about a conflict, cite both sides.

## Verdict

Return \`approve\` or \`request_changes\` with a summary and your findings. An
approval may carry non-blocking medium or low suggestions, but never a critical
or high finding: if something is critical or high, the verdict is
\`request_changes\`.

## The plan

The plan is at \`${planPath}\` in this repository. It is ${planContents.split(/\r?\n/).length} lines. Read it from disk rather than relying on any excerpt.
`;
}

export async function reviewProductPlan(root, planPath, options = {}) {
  const config = loadReviewConfig(root);
  if (!config.enabled) {
    console.log("multi-agent review is disabled; skipping Product Plan review");
    return { status: "SKIPPED", exitCode: EXIT_APPROVED, results: [] };
  }
  const absolutePlan = resolve(root, planPath);
  if (!existsSync(absolutePlan)) fail(`plan does not exist: ${planPath}`);
  const planContents = readFileSync(absolutePlan, "utf8");
  const fingerprint = planFingerprint(planContents);
  const paths = planReviewArtifactPaths(planPath);

  console.log(`reviewing ${planPath}`);
  console.log(`fingerprint ${fingerprint}`);
  console.log("");

  const results = [];
  const scratchRoot = mkdtempSync(join(tmpdir(), "parallel-slices-plan-"));
  try {
    for (const reviewer of config.reviewers) {
      const ready = await preflightProvider(reviewer.provider, {
        root,
        billingPolicy: config.billingPolicy,
      });
      if (ready.ok === false) {
        console.error(`preflight failed: ${ready.message}`);
        for (const hint of ready.instructions || []) console.error(`  ${hint}`);
        return { status: "FAILED", exitCode: EXIT_FAILED, results };
      }
      console.log(
        `reviewing: ${reviewer.id} (${reviewer.provider}, ${reviewer.model || "default model"})`,
      );
      const started = Date.now();
      const invocation = await invokeProvider({
        reviewer,
        root,
        snapshot: { snapshotRoot: root },
        scratchRoot,
        timeoutMs: config.turnTimeoutSeconds * 1000,
        billingPolicy: config.billingPolicy,
        promptOverride: packet(planPath, planContents, reviewer),
      });
      if (invocation.problem) {
        console.error(`  ${invocation.problem.message}`);
        for (const hint of invocation.problem.instructions || []) {
          console.error(`    ${hint}`);
        }
        if (invocation.problem.output) {
          for (const line of invocation.problem.output
            .split(/\r?\n/)
            .slice(-6)) {
            if (line.trim()) console.error(`    ${line.trim().slice(0, 200)}`);
          }
        }
        return { status: "FAILED", exitCode: EXIT_FAILED, results };
      }
      const response = invocation.response;
      results.push({
        reviewerId: reviewer.id,
        provider: reviewer.provider,
        providerVersion: ready.version,
        verdict: response.verdict,
        summary: response.summary,
        findings: response.findings,
        durationMs: Date.now() - started,
      });
      console.log(
        `  ${reviewer.id}: ${response.verdict}, ${response.findings.length} findings`,
      );
    }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }

  const findings = results.flatMap((entry) =>
    entry.findings.map((finding, index) => ({
      id: `P${String(index + 1).padStart(3, "0")}-${entry.reviewerId}`,
      raisedBy: entry.reviewerId,
      ...finding,
    })),
  );
  const blocking = findings.filter((finding) =>
    ["critical", "high"].includes(finding.severity),
  );
  const allApproved = results.every((entry) => entry.verdict === "approve");
  const approved = allApproved && blocking.length === 0;

  writeArtifacts(root, paths, {
    version: 1,
    plan: planPath,
    fingerprint,
    reviewedAt: options.now ? options.now() : new Date().toISOString(),
    status: approved ? "approved" : "changes_requested",
    reviewers: results.map((entry) => ({
      reviewerId: entry.reviewerId,
      provider: entry.provider,
      providerVersion: entry.providerVersion,
      verdict: entry.verdict,
      summary: entry.summary,
      durationMs: entry.durationMs,
    })),
    findings,
  });

  console.log("");
  console.log(`review JSON: ${paths.json}`);
  console.log(`review Markdown: ${paths.markdown}`);
  if (approved) {
    console.log("");
    console.log(
      `PRODUCT PLAN APPROVED by all ${results.length} reviewers independently`,
    );
    return { status: "APPROVED", exitCode: EXIT_APPROVED, results, findings };
  }
  console.log("");
  console.log(
    `PRODUCT PLAN CHANGES REQUESTED: ${findings.length} findings, ${blocking.length} blocking`,
  );
  return {
    status: "CHANGES_REQUESTED",
    exitCode: EXIT_CHANGES_REQUESTED,
    results,
    findings,
  };
}

function writeArtifacts(root, paths, ledger) {
  mkdirSync(resolve(root, paths.directory), { recursive: true });
  writeFileSync(
    resolve(root, paths.json),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
  const lines = [
    "# Product Plan review",
    "",
    "Generated from the adjacent JSON ledger. Reviewers do not edit either file.",
    "",
    `- Plan: \`${ledger.plan}\``,
    `- Fingerprint: \`${ledger.fingerprint}\``,
    `- Reviewed: ${ledger.reviewedAt}`,
    `- Outcome: **${ledger.status}**`,
    "",
    "## Verdicts",
    "",
    "| Reviewer | Provider | Verdict | Duration | Summary |",
    "| --- | --- | --- | ---: | --- |",
  ];
  for (const entry of ledger.reviewers) {
    const summary = String(entry.summary)
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
    lines.push(
      `| ${entry.reviewerId} | ${entry.provider} | ${entry.verdict} | ${entry.durationMs} ms | ${summary} |`,
    );
  }
  lines.push("", "## Findings", "");
  if (!ledger.findings.length) {
    lines.push("No findings were reported.");
  }
  for (const finding of ledger.findings) {
    const evidence = (finding.evidence || [])
      .map((item) => `- \`${item.path}:${item.line}\` ${item.detail}`)
      .join("\n");
    lines.push(
      `### ${finding.id}: ${finding.title}`,
      "",
      `- Severity: ${finding.severity}`,
      `- Category: ${finding.category}`,
      `- Raised by: ${finding.raisedBy}`,
      "",
      finding.description,
      "",
      "Evidence:",
      "",
      evidence || "- none provided",
      "",
      `Recommendation: ${finding.recommendation}`,
      "",
    );
  }
  writeFileSync(resolve(root, paths.markdown), `${lines.join("\n")}\n`);
}

function parseArguments(argv) {
  let plan;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--plan") {
      plan = argv[index + 1];
      index += 1;
    } else fail(`unknown argument: ${argv[index]}`);
  }
  if (!plan) fail("usage: review-plan.mjs --plan docs/plans/<plan>.md");
  return { plan: plan.replace(/^\.\//, "") };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  // parseArguments must be inside the guard: a usage error is an ordinary
  // mistake and deserves the same one-line message as any other failure, not an
  // unhandled rejection and a stack trace.
  try {
    const { plan } = parseArguments(process.argv.slice(2));
    const result = await reviewProductPlan(repositoryRoot(), plan);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`PRODUCT PLAN REVIEW FAILED: ${error.message}`);
    process.exitCode = EXIT_FAILED;
  }
}
