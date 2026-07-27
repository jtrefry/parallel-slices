#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (/\.ya?ml$/.test(entry.name)) files.push(path);
  }
  return files;
}

const architectureWorkflowDirectories = readdirSync(
  resolve(root, "architectures"),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    resolve(root, "architectures", entry.name, "repo-overlay/.github"),
  )
  .filter(existsSync);
const directories = [
  resolve(root, ".github"),
  resolve(root, "repo-overlay/.github"),
  ...architectureWorkflowDirectories,
];
const files = [
  ...directories.flatMap(walk),
  ...walk(resolve(root, "examples")).filter((path) =>
    path.includes("github-actions-"),
  ),
];

for (const path of files) {
  const document = parse(readFileSync(path, "utf8"), { uniqueKeys: true });
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`YAML document must be a mapping: ${relative(root, path)}`);
  }
  for (const job of Object.values(document.jobs || {})) {
    const images = Object.values(job.services || {}).map(
      (service) => service.image,
    );
    if (job.container) {
      images.push(
        typeof job.container === "string" ? job.container : job.container.image,
      );
    }
    for (const image of images.filter(Boolean)) {
      if (!/@sha256:[0-9a-f]{64}$/.test(image)) {
        throw new Error(
          `workflow container image must be pinned by digest in ${relative(root, path)}: ${image}`,
        );
      }
    }
  }
}

console.log(`workflow YAML passed: ${files.length} files`);
