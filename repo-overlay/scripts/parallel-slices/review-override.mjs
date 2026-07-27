#!/usr/bin/env node
// A human accepts a specific review finding, on the record.
//
// A gate that can block forever with no way past it is not a gate, it is a
// deadlock, and a workflow that can deadlock is not usable. Reviewers are
// sometimes wrong, sometimes insist on something that contradicts a decision
// the human already made deliberately, and sometimes raise a real issue the
// human accepts anyway. Without a way through, the only remaining options are
// to disable review entirely or to edit the ledger by hand, and both are worse
// than an override that is designed.
//
// The opposite failure matters just as much. An override that is cheap turns
// every gate into decoration. So this is deliberately not a flag on the review
// command and there is no "approve anyway" switch:
//
//   - it is a separate, explicit action a person takes;
//   - it names the exact findings being accepted, not "all problems";
//   - it requires a substantive written reason for each;
//   - it is recorded permanently in the review ledger and its Markdown, and
//     carried into the final audit;
//   - it is bound to the reviewed fingerprint, so it cannot survive an edit to
//     the thing that was reviewed.
//
// The cost of overriding is permanent visibility. That is the right price: it
// stays cheap to do when you are right and permanently legible when you are
// not.
//
//   node scripts/parallel-slices/review-override.mjs \
//     --artifact docs/plans/reviews/<feature>/product-plan.json \
//     --finding P001-codex-review \
//     --reason "R29 is being rewritten in the next plan revision; this finding
//               is correct and is superseded rather than dismissed."

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

const MINIMUM_REASON = 40;

function repositoryRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  throw new Error(message);
}

// Two ledger shapes exist: the flat Product Plan review, and the attempt-based
// planning and slice reviews. Both keep findings in a `findings` array, so
// locate whichever object owns the current one rather than special-casing.
export function locateReviewRecord(ledger) {
  if (Array.isArray(ledger.attempts) && ledger.attempts.length) {
    return ledger.attempts[ledger.attempts.length - 1];
  }
  if (Array.isArray(ledger.findings)) return ledger;
  fail("review artifact has no findings to override");
}

export function applyOverrides(ledger, requested, reason, decidedAt) {
  const record = locateReviewRecord(ledger);
  const findings = record.findings || [];
  if (!findings.length)
    fail("review reported no findings; nothing to override");

  const known = new Map(findings.map((finding) => [finding.id, finding]));
  const ids = requested === "all" ? [...known.keys()] : requested;
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    fail(
      `review artifact has no such finding: ${unknown.join(", ")}\nknown findings: ${[...known.keys()].join(", ")}`,
    );
  }

  record.overrides = record.overrides || [];
  const already = new Set(record.overrides.map((entry) => entry.findingId));
  for (const id of ids) {
    if (already.has(id)) continue;
    const finding = known.get(id);
    record.overrides.push({
      findingId: id,
      severity: finding.severity,
      title: finding.title,
      raisedBy: finding.raisedBy,
      reason,
      decidedAt,
    });
  }

  // The review still blocks unless every finding that blocked it is accounted
  // for. Overriding one high finding out of three does not unblock anything,
  // which keeps a partial override honest rather than misleading.
  const overridden = new Set(record.overrides.map((entry) => entry.findingId));
  const outstanding = findings.filter(
    (finding) =>
      ["critical", "high"].includes(finding.severity) &&
      !overridden.has(finding.id),
  );
  record.status = outstanding.length
    ? "changes_requested"
    : "approved_with_overrides";
  return { record, overridden: [...overridden], outstanding };
}

function overrideMarkdown(ledger) {
  const record = locateReviewRecord(ledger);
  if (!record.overrides?.length) return "";
  const lines = [
    "",
    "## Human overrides",
    "",
    "A person accepted these findings deliberately. Each entry is permanent and",
    "is carried into the final audit.",
    "",
    "| Finding | Severity | Raised by | Decided | Reason |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const entry of record.overrides) {
    const reason = String(entry.reason)
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
    lines.push(
      `| ${entry.findingId} | ${entry.severity} | ${entry.raisedBy} | ${entry.decidedAt} | ${reason} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function overrideReviewFindings(root, options) {
  const artifactPath = options.artifact;
  const absolute = resolve(root, artifactPath);
  if (!existsSync(absolute)) fail(`review artifact not found: ${artifactPath}`);
  if (!/\.json$/.test(artifactPath)) {
    fail("--artifact must be the review JSON ledger");
  }
  const reason = (options.reason || "").trim();
  if (reason.length < MINIMUM_REASON) {
    fail(
      `--reason must be a substantive explanation of at least ${MINIMUM_REASON} characters; an override is a permanent record, not a checkbox`,
    );
  }
  const ledger = JSON.parse(readFileSync(absolute, "utf8"));
  const decidedAt = options.now ? options.now() : new Date().toISOString();
  const { overridden, outstanding } = applyOverrides(
    ledger,
    options.all ? "all" : options.findings,
    reason,
    decidedAt,
  );

  writeFileSync(absolute, `${JSON.stringify(ledger, null, 2)}\n`);
  const markdownPath = absolute.replace(/\.json$/, ".md");
  if (existsSync(markdownPath)) {
    const existing = readFileSync(markdownPath, "utf8").replace(
      /\n## Human overrides\n[\s\S]*?(?=\n## |$)/,
      "",
    );
    writeFileSync(
      markdownPath,
      `${existing.trimEnd()}\n${overrideMarkdown(ledger)}`,
    );
  }

  const record = locateReviewRecord(ledger);
  console.log(`overrode ${overridden.length} finding(s) in ${artifactPath}`);
  for (const entry of record.overrides) {
    console.log(`  ${entry.findingId}  ${entry.severity}  ${entry.title}`);
  }
  console.log("");
  if (outstanding.length) {
    console.log(
      `still blocked by ${outstanding.length} finding(s): ${outstanding.map((f) => f.id).join(", ")}`,
    );
    return { status: "changes_requested", exitCode: 10 };
  }
  console.log(`status: ${record.status}`);
  console.log("This override is permanent and appears in the final audit.");
  return { status: record.status, exitCode: 0 };
}

function parseArguments(argv) {
  const options = { findings: [], all: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--all") options.all = true;
    else if (["--artifact", "--finding", "--reason"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) fail(`${argument} requires a value`);
      if (argument === "--artifact")
        options.artifact = value.replace(/^\.\//, "");
      else if (argument === "--finding") options.findings.push(value);
      else options.reason = value;
      index += 1;
    } else fail(`unknown argument: ${argument}`);
  }
  if (!options.artifact) {
    fail(
      "usage: review-override.mjs --artifact <review.json> (--finding <id> | --all) --reason <text>",
    );
  }
  if (!options.all && !options.findings.length) {
    fail("name the findings with --finding <id>, or use --all deliberately");
  }
  return options;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await overrideReviewFindings(repositoryRoot(), options);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`REVIEW OVERRIDE FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
