import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertNoPotentialSecrets,
  containsPotentialSecret,
  containsUnsafeProseControl,
  containsUnsafeTextControl,
} from "../repo-overlay/scripts/parallel-slices/content-safety.mjs";

const syntheticSecrets = {
  privateKey: ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
  awsAccessKey: ["AK", "IA", "C".repeat(16)].join(""),
  githubToken: ["gh", "p_", "a1B2".repeat(9)].join(""),
  stripeKey: ["sk", "_live_", "a".repeat(24)].join(""),
  slackToken: ["xo", "xb-", "1234567890abcdef".repeat(2)].join(""),
  googleApiKey: ["AI", "za", "B".repeat(35)].join(""),
  anthropicKey: ["sk-", "ant-", `api03-${"a".repeat(24)}`].join(""),
  gitlabToken: ["gl", "pat-", "c".repeat(20)].join(""),
  npmToken: ["np", "m_", "d".repeat(36)].join(""),
  signedJwt: [
    "ey",
    "JhbGciOiJIUzI1NiJ9",
    ".ey",
    "JzdWIiOiIxMjM0In0",
    ".",
    "c2ln".repeat(4),
  ].join(""),
  awsSecretKey: ["aws", '_secret = "', "A9".repeat(20), '"'].join(""),
};

test("detects every supported secret pattern class", () => {
  for (const [name, secret] of Object.entries(syntheticSecrets)) {
    assert.equal(
      containsPotentialSecret(`prefix ${secret} suffix`),
      true,
      `${name} was not detected`,
    );
  }
});

test("passes ordinary text and near-miss values", () => {
  for (const text of [
    "export const reviewed = true;",
    "The keyJar utility caches parsed values.",
    "Install with npm install and run npm test.",
    `aws region configuration uses ${"a".repeat(12)}`,
    "ghp_short",
  ]) {
    assert.equal(containsPotentialSecret(text), false, text);
  }
});

test("scans files including NUL-byte and oversized content", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-secret-scan-"));
  try {
    writeFileSync(
      join(root, "binary-secret.bin"),
      Buffer.concat([
        Buffer.from([0, 1, 2]),
        Buffer.from(syntheticSecrets.githubToken, "utf8"),
        Buffer.from([0]),
      ]),
    );
    assert.throws(
      () => assertNoPotentialSecrets(root, ["binary-secret.bin"]),
      /possible secret detected in file: binary-secret\.bin/,
    );

    writeFileSync(
      join(root, "oversized-secret.log"),
      `${syntheticSecrets.stripeKey}\n${"padding\n".repeat(300_000)}`,
    );
    assert.throws(
      () => assertNoPotentialSecrets(root, ["oversized-secret.log"]),
      /possible secret detected in file: oversized-secret\.log/,
    );

    writeFileSync(join(root, "clean.txt"), "no credentials here\n");
    writeFileSync(
      join(root, "clean.bin"),
      Buffer.from([0, 1, 2, 3, 65, 66, 67]),
    );
    writeFileSync(
      join(root, "clean-oversized.log"),
      `benign log line\n${"padding\n".repeat(300_000)}`,
    );
    assert.doesNotThrow(() =>
      assertNoPotentialSecrets(root, [
        "clean.txt",
        "clean.bin",
        "clean-oversized.log",
        "missing.txt",
      ]),
    );

    assert.throws(
      () => assertNoPotentialSecrets(root, ["../outside.txt"]),
      /unsafe file path/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("distinguishes strict text control from prose control validation", () => {
  assert.equal(containsUnsafeTextControl("one line"), false);
  assert.equal(containsUnsafeTextControl("two\nlines"), true);
  assert.equal(containsUnsafeTextControl("tab\tseparated"), true);

  assert.equal(containsUnsafeProseControl("two\nlines with\ttab\r\n"), false);
  const hiddenCharacters = [
    "\u0000",
    "\u0007",
    "\u001b",
    "\u007f",
    "\u202a",
    "\u202e",
    "\u2066",
    "\u2069",
    "\u200b",
    "\u200d",
    "\u2060",
    "\ufeff",
  ];
  for (const character of hiddenCharacters) {
    assert.equal(
      containsUnsafeProseControl(`safe${character}text`),
      true,
      JSON.stringify(character),
    );
  }
});
