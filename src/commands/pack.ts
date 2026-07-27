// @openclaw/agent-sdk — Pack command: validate manifest, hash files, generate integrity manifest.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { hashFile } from "../hash.js";
import type {
  AgentPackageManifest,
  IntegrityManifest,
  SkillDeclaration,
} from "../index.js";
import { resolvePackageFile, resolveWorkspacePath } from "../paths.js";

function loadManifest(packagePath: string): AgentPackageManifest {
  const manifestPath = resolve(packagePath, "agent-package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`agent-package.json not found in ${packagePath}`);
  }
  const raw = readFileSync(manifestPath, "utf8");
  return JSON.parse(raw) as AgentPackageManifest;
}

function validateRequiredFields(manifest: Partial<AgentPackageManifest>): string[] {
  const errors: string[] = [];
  if (!manifest.name) errors.push("name is required");
  if (!manifest.version) errors.push("version is required");
  if (!manifest.description) errors.push("description is required");
  if (!manifest.files) {
    errors.push("files is required");
  } else {
    if (!Array.isArray(manifest.files.copy)) errors.push("files.copy must be an array");
    if (!Array.isArray(manifest.files.mutable)) errors.push("files.mutable must be an array");
  }
  return errors;
}

function validateCopyEntries(
  manifest: AgentPackageManifest,
  packagePath: string,
): { resolved: Map<string, string>; errors: string[] } {
  const resolved = new Map<string, string>();
  const errors: string[] = [];

  for (const [index, entry] of manifest.files.copy.entries()) {
    const source = resolvePackageFile(packagePath, entry.src, `files.copy.${index}.src`);
    if (source.error || !source.path) {
      errors.push(source.error ?? `files.copy.${index}.src could not be resolved`);
      continue;
    }
    const dest = resolveWorkspacePath(packagePath, entry.dest, `files.copy.${index}.dest`);
    if (dest.error) {
      errors.push(dest.error);
      continue;
    }
    const hash = hashFile(source.path);
    resolved.set(entry.dest, hash);
  }

  return { resolved, errors };
}

function hashSkillFiles(
  skills: SkillDeclaration[] | undefined,
  packagePath: string,
): { resolved: Map<string, string>; errors: string[] } {
  const resolved = new Map<string, string>();
  const errors: string[] = [];

  if (!skills) return { resolved, errors };

  for (const skill of skills) {
    const skillSource = `${skill.path}/SKILL.md`;
    const skillMd = resolvePackageFile(packagePath, skillSource, `skills.${skill.path}.SKILL.md`);
    if (skillMd.error || !skillMd.path) {
      if (skill.required !== false) {
        errors.push(`required SKILL.md invalid: ${skillSource}: ${skillMd.error}`);
      }
      continue;
    }
    const hash = hashFile(skillMd.path);
    resolved.set(skillSource, hash);
  }

  return { resolved, errors };
}

export const packCommand = new Command("pack")
  .description("Validate manifest, hash files, generate openclaw.integrity.json")
  .argument("[path]", "Package directory", ".")
  .action(async (packagePath: string) => {
    const resolved = resolve(packagePath);

    let manifest: AgentPackageManifest;
    try {
      manifest = loadManifest(resolved);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    const fieldErrors = validateRequiredFields(manifest);
    if (fieldErrors.length > 0) {
      console.error("Validation failed:");
      for (const e of fieldErrors) console.error(`  - ${e}`);
      process.exit(1);
    }

    const { resolved: fileHashes, errors: fileErrors } = validateCopyEntries(manifest, resolved);
    const { resolved: skillHashes, errors: skillErrors } = hashSkillFiles(manifest.skills, resolved);

    const allErrors = [...fileErrors, ...skillErrors];
    if (allErrors.length > 0) {
      console.error("Pack failed:");
      for (const e of allErrors) console.error(`  - ${e}`);
      process.exit(1);
    }

    const integrity: IntegrityManifest = {
      version: 1,
      algorithm: "sha256",
      package: {
        name: manifest.name,
        version: manifest.version,
      },
      files: Object.fromEntries(fileHashes),
      skills: Object.fromEntries(skillHashes),
      generatedAt: new Date().toISOString(),
    };

    const outputPath = resolve(resolved, "openclaw.integrity.json");
    writeFileSync(outputPath, JSON.stringify(integrity, null, 2) + "\n", "utf8");

    console.log(`Integrity manifest written to ${outputPath}`);
    console.log(`  Files tracked: ${fileHashes.size}`);
    console.log(`  Skills tracked: ${skillHashes.size}`);
  });
