#!/usr/bin/env node
// Prove every configured reviewer can actually produce a schema-valid response
// before a real review spends anything.
//
// Every multi-agent review failure this repository has hit was detectable in
// seconds: an auth probe reading the wrong stream, a response schema both
// provider APIs reject, a CLI flag that moved, a model id the account cannot
// reach. Each one instead surfaced minutes into a real review, or after a
// ten-minute turn timeout, with a diagnostic that named neither the provider
// nor its output.
//
// This asks each provider one trivial question through the exact same
// invocation path a real review uses, and reports precisely what came back.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

import { loadReviewConfig } from "./review-config.mjs";
import { validateReviewerResponse } from "./review-contract.mjs";
import { invokeProvider, preflightProvider } from "./review-providers.mjs";

function repositoryRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const SMOKE_TIMEOUT_MS = 180_000;

const SMOKE_PROMPT = [
  "This is a connectivity check, not a review.",
  'Return the structured response with verdict "approve", a one-sentence',
  "summary saying the connectivity check succeeded, and an empty findings array.",
  "Do not read any files. Do not run any commands.",
].join(" ");

function line(text = "") {
  console.log(text);
}

export async function runReviewSmoke(root, options = {}) {
  const config = loadReviewConfig(root);
  if (!config.enabled) {
    line("multi-agent review is disabled; nothing to check");
    return { ok: true, results: [] };
  }
  const schema = JSON.parse(
    readFileSync(
      resolve(root, ".parallel-slices/review-response.schema.json"),
      "utf8",
    ),
  );
  assertProviderSafeSchema(schema);
  line(
    `response schema is provider-safe (${Object.keys(schema.$defs || {}).length} definitions)`,
  );
  line("");

  const results = [];
  for (const reviewer of config.reviewers) {
    const label = `${reviewer.id} (${reviewer.provider}, ${reviewer.model || "default model"})`;
    line(`checking ${label}`);
    const result = await checkReviewer(root, reviewer, config, options);
    results.push({ reviewer: reviewer.id, ...result });
    if (result.ok) {
      line(`  ok: ${result.detail}`);
    } else {
      line(`  FAILED: ${result.detail}`);
      for (const hint of result.instructions || []) line(`    ${hint}`);
      if (result.output) {
        line("    provider output:");
        for (const outputLine of result.output.split(/\r?\n/).slice(-8)) {
          if (outputLine.trim())
            line(`      ${outputLine.trim().slice(0, 200)}`);
        }
      }
    }
    line("");
  }
  const failed = results.filter((entry) => !entry.ok);
  if (failed.length) {
    line(
      `${failed.length} of ${results.length} reviewers cannot complete a review`,
    );
    return { ok: false, results };
  }
  line(`all ${results.length} reviewers returned a schema-valid response`);
  return { ok: true, results };
}

// The structured-output endpoints both providers use refuse a top-level
// allOf, anyOf or oneOf, and at least one CLI cannot resolve a draft 2020-12
// meta-schema reference. Catching that here is the difference between a clear
// message now and an opaque provider 400 later.
export function assertProviderSafeSchema(schema) {
  const rejected = ["allOf", "anyOf", "oneOf"].filter((key) => key in schema);
  if (rejected.length) {
    throw new Error(
      `review-response.schema.json has top-level ${rejected.join(", ")}; structured-output APIs reject it`,
    );
  }
  if ("$schema" in schema) {
    throw new Error(
      "review-response.schema.json declares $schema; provider CLIs cannot resolve the meta-schema reference",
    );
  }
}

async function checkReviewer(root, reviewer, config, options) {
  const preflight = await preflightProvider(reviewer.provider, {
    root,
    billingPolicy: config.billingPolicy,
  });
  if (preflight.ok === false) {
    return {
      ok: false,
      stage: "preflight",
      detail: preflight.message,
      instructions: preflight.instructions,
    };
  }
  if (options.preflightOnly) {
    return { ok: true, stage: "preflight", detail: `${preflight.version}` };
  }

  const scratchRoot = mkdtempSync(join(tmpdir(), "parallel-slices-smoke-"));
  try {
    const invocation = await invokeProvider({
      reviewer,
      root,
      snapshot: { snapshotRoot: root },
      scratchRoot,
      timeoutMs: SMOKE_TIMEOUT_MS,
      billingPolicy: config.billingPolicy,
      promptOverride: SMOKE_PROMPT,
    });
    if (invocation.problem) {
      return {
        ok: false,
        stage: "invoke",
        detail: invocation.problem.message,
        instructions: invocation.problem.instructions,
        output: invocation.problem.output,
      };
    }
    validateReviewerResponse(invocation.response);
    return {
      ok: true,
      stage: "invoke",
      detail: `verdict ${invocation.response.verdict}, ${invocation.response.findings.length} findings, ${preflight.version}`,
    };
  } catch (error) {
    return { ok: false, stage: "validate", detail: error.message };
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  const preflightOnly = process.argv.includes("--preflight-only");
  runReviewSmoke(repositoryRoot(), { preflightOnly })
    .then((result) => {
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`REVIEW SMOKE FAILED: ${error.message}`);
      process.exitCode = 1;
    });
}
