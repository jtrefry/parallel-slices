import { assertSafeRelativePath } from "./scope-policy.mjs";
import {
  containsUnsafeProseControl,
  containsUnsafeTextControl,
} from "./content-safety.mjs";

const severities = new Set(["critical", "high", "medium", "low"]);
const categories = new Set([
  "security",
  "correctness",
  "testing",
  "accessibility",
  "performance",
  "scalability",
  "architecture",
  "documentation",
  "release",
  "scope",
]);

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertKeys(value, required, label) {
  const actual = Object.keys(value);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !required.includes(key));
  if (missing.length) fail(`${label} is missing fields: ${missing.join(", ")}`);
  if (unknown.length)
    fail(`${label} has unknown fields: ${unknown.join(", ")}`);
}

function assertText(value, label, maximum) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    containsUnsafeTextControl(value)
  ) {
    fail(`${label} must be non-empty text of at most ${maximum} characters`);
  }
}

function assertProse(value, label, maximum) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    containsUnsafeProseControl(value)
  ) {
    fail(`${label} must be non-empty prose of at most ${maximum} characters`);
  }
}

export function validateReviewerResponse(response) {
  assertObject(response, "reviewer response");
  assertKeys(response, ["verdict", "summary", "findings"], "reviewer response");
  if (!new Set(["approve", "request_changes"]).has(response.verdict)) {
    fail("reviewer verdict must be approve or request_changes");
  }
  assertProse(response.summary, "reviewer summary", 4000);
  if (!Array.isArray(response.findings) || response.findings.length > 20) {
    fail("reviewer findings must be an array with at most 20 entries");
  }
  for (const [index, finding] of response.findings.entries()) {
    const label = `findings[${index}]`;
    assertObject(finding, label);
    assertKeys(
      finding,
      [
        "severity",
        "category",
        "title",
        "description",
        "evidence",
        "recommendation",
      ],
      label,
    );
    if (!severities.has(finding.severity)) fail(`${label}.severity is invalid`);
    if (!categories.has(finding.category)) fail(`${label}.category is invalid`);
    assertText(finding.title, `${label}.title`, 200);
    assertProse(finding.description, `${label}.description`, 2000);
    assertProse(finding.recommendation, `${label}.recommendation`, 2000);
    if (
      !Array.isArray(finding.evidence) ||
      finding.evidence.length === 0 ||
      finding.evidence.length > 10
    ) {
      fail(`${label}.evidence must contain between 1 and 10 entries`);
    }
    for (const [evidenceIndex, evidence] of finding.evidence.entries()) {
      const evidenceLabel = `${label}.evidence[${evidenceIndex}]`;
      assertObject(evidence, evidenceLabel);
      assertKeys(evidence, ["path", "line", "detail"], evidenceLabel);
      assertSafeRelativePath(evidence.path, `${evidenceLabel}.path`);
      if (!Number.isInteger(evidence.line) || evidence.line < 1) {
        fail(`${evidenceLabel}.line must be a positive integer`);
      }
      assertText(evidence.detail, `${evidenceLabel}.detail`, 1000);
    }
  }
  if (
    response.verdict === "approve" &&
    response.findings.some((finding) =>
      new Set(["critical", "high"]).has(finding.severity),
    )
  ) {
    fail("approve verdict cannot introduce a critical or high finding");
  }
  // A single independent pass per reviewer, unanimity to pass. Reviewers no
  // longer negotiate over each other's findings, so there is nothing to assess.
  if (
    response.verdict === "request_changes" &&
    response.findings.length === 0
  ) {
    fail("request_changes verdict must report at least one finding");
  }
  return response;
}

export function parseJsonObject(text, label = "provider response") {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

export function reviewJsonMarkers(nonce) {
  if (typeof nonce !== "string" || !/^[0-9a-f-]{16,}$/.test(nonce)) {
    fail("marked JSON parsing requires a per-invocation nonce");
  }
  return {
    begin: `PARALLEL_SLICES_REVIEW_JSON_BEGIN_${nonce}`,
    end: `PARALLEL_SLICES_REVIEW_JSON_END_${nonce}`,
  };
}

export function parseMarkedJson(text, nonce) {
  const { begin, end } = reviewJsonMarkers(nonce);
  const ansiEscape = new RegExp(
    `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
    "g",
  );
  const clean = text.replace(ansiEscape, "");
  const beginOccurrences = clean.split(begin).length - 1;
  if (beginOccurrences > 1) {
    fail("marked response contains more than one begin marker");
  }
  const startIndex = clean.indexOf(begin);
  const endIndex = clean.indexOf(end, startIndex + begin.length);
  if (startIndex < 0 || endIndex < 0) {
    fail("marked response did not contain the required JSON markers");
  }
  return parseJsonObject(
    clean.slice(startIndex + begin.length, endIndex).trim(),
    "marked response",
  );
}

export const blockingSeverities = Object.freeze(["critical", "high"]);
