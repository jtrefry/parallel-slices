import assert from "node:assert/strict";
import test from "node:test";

import {
  commandNamespaceProblems,
  dependabotCoverageProblems,
  dependabotIgnoreProblems,
  markdownAnchors,
} from "../scripts/audit-repository.mjs";

test("requires canonical command namespaces and matching short aliases", () => {
  assert.deepEqual(
    commandNamespaceProblems(
      ["parallel-slices-status", "slices-status"],
      ".cursor/commands",
    ),
    [],
  );
  assert.match(
    commandNamespaceProblems(["status"], ".cursor/commands").join("\n"),
    /lacks a Parallel Slices namespace/,
  );
  assert.match(
    commandNamespaceProblems(
      ["parallel-slices-status"],
      ".cursor/commands",
    ).join("\n"),
    /missing its short alias/,
  );
  assert.match(
    commandNamespaceProblems(["slices-status"], ".cursor/commands").join("\n"),
    /missing its canonical entry/,
  );
});

test("derives local Markdown anchors using GitHub heading rules", () => {
  const anchors = markdownAnchors(`# Guide

## Optional: configure GitHub publication

## Use \`nextjs-gcp-postgres\`

## Guide
`);

  assert.equal(anchors.has("optional-configure-github-publication"), true);
  assert.equal(anchors.has("use-nextjs-gcp-postgres"), true);
  assert.equal(anchors.has("guide-1"), true);
  assert.equal(anchors.has("optional:-configure-github-publication"), false);
});

test("requires dependency automation for architecture source directories", () => {
  const updates = [
    { "package-ecosystem": "npm", directory: "/" },
    { "package-ecosystem": "github-actions", directory: "/" },
    { "package-ecosystem": "npm", directory: "/scaffold" },
    { "package-ecosystem": "github-actions", directory: "/repo-overlay" },
  ];
  assert.deepEqual(
    dependabotCoverageProblems(updates, [
      "npm:/",
      "github-actions:/",
      "npm:/architectures/nextjs-gcp-postgres/scaffold",
      "github-actions:/architectures/nextjs-gcp-postgres/repo-overlay",
    ]),
    [
      "Dependabot is missing npm:/architectures/nextjs-gcp-postgres/scaffold",
      "Dependabot is missing github-actions:/architectures/nextjs-gcp-postgres/repo-overlay",
    ],
  );
});

test("requires architecture source automation to preserve reviewed ignores", () => {
  const directory = "/architectures/nextjs-gcp-postgres/scaffold";
  const required = [
    { "dependency-name": "eslint", versions: [">=10.0.0"] },
    { "dependency-name": "typescript", versions: [">=6.1.0"] },
  ];
  const updates = [
    {
      "package-ecosystem": "npm",
      directory,
      ignore: [{ "dependency-name": "eslint", versions: [">=10.0.0"] }],
    },
  ];
  assert.deepEqual(
    dependabotIgnoreProblems(updates, "npm", directory, required),
    [
      `Dependabot npm:${directory} is missing the reviewed ignore for typescript (>=6.1.0)`,
    ],
  );
  updates[0].ignore.push(required[1]);
  assert.deepEqual(
    dependabotIgnoreProblems(updates, "npm", directory, required),
    [],
  );
});
