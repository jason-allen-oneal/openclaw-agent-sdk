import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { hashFile } from "../hash.js";
import { INSTRUCTION_FILES } from "../index.js";
import type {
  AgentPackageManifest,
  FileCopyEntry,
  FileMutableEntry,
  IntegrityManifest,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from "../index.js";
import {
  isSameOrInsidePath,
  normalizeManifestPath,
  resolvePackageFile,
  resolveWorkspacePath,
  validateRelativePath,
} from "../paths.js";

const INSTRUCTION_FILE_SET = new Set<string>(INSTRUCTION_FILES);

type ValidationIssue = ValidationError;

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function validateString(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(issue(path, "must be a non-empty string"));
  }
}

function validateBoolean(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof value !== "boolean") {
    errors.push(issue(path, "must be a boolean"));
  }
}

function validateStringArray(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    errors.push(issue(path, "must be an array of non-empty strings"));
  }
}

function validateEnum(value: unknown, path: string, allowed: readonly string[], errors: ValidationIssue[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(issue(path, `must be one of: ${allowed.join(", ")}`));
  }
}

function validateSchema(manifest: unknown): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (!isRecord(manifest)) {
    return [issue("agent-package.json", "must be a JSON object")];
  }

  validateString(manifest.name, "name", errors);
  validateString(manifest.version, "version", errors);
  validateString(manifest.description, "description", errors);

  if (!isRecord(manifest.files)) {
    errors.push(issue("files", "is required and must be an object"));
  } else {
    if (!Array.isArray(manifest.files.copy)) {
      errors.push(issue("files.copy", "must be an array"));
    }
    if (!Array.isArray(manifest.files.mutable)) {
      errors.push(issue("files.mutable", "must be an array"));
    }
  }

  validateSkills(manifest.skills, errors);
  validateSecrets(manifest.secrets, errors);
  validateTools(manifest.tools, errors);
  validateChannels(manifest.channels, errors);
  validateSchedules(manifest.schedules, errors);
  validatePolicy(manifest.policy, errors);

  return errors;
}

function validateSkills(value: unknown, errors: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(issue("skills", "must be an array"));
    return;
  }
  for (const [index, skill] of value.entries()) {
    const path = `skills.${index}`;
    if (!isRecord(skill)) {
      errors.push(issue(path, "must be an object"));
      continue;
    }
    validateString(skill.path, `${path}.path`, errors);
    if (skill.required !== undefined) validateBoolean(skill.required, `${path}.required`, errors);
  }
}

function validateSecrets(value: unknown, errors: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(issue("secrets", "must be an object"));
    return;
  }

  if (!Array.isArray(value.consumer)) {
    errors.push(issue("secrets.consumer", "must be an array"));
  } else {
    for (const [index, consumer] of value.consumer.entries()) {
      const path = `secrets.consumer.${index}`;
      if (!isRecord(consumer)) {
        errors.push(issue(path, "must be an object"));
        continue;
      }
      validateString(consumer.name, `${path}.name`, errors);
      validateBoolean(consumer.required, `${path}.required`, errors);
      if (consumer.description !== undefined) validateString(consumer.description, `${path}.description`, errors);
    }
  }

  if (!isRecord(value.mapping)) {
    errors.push(issue("secrets.mapping", "must be an object"));
  } else {
    for (const [name, mapping] of Object.entries(value.mapping)) {
      const path = `secrets.mapping.${name}`;
      if (!isRecord(mapping)) {
        errors.push(issue(path, "must be an object"));
        continue;
      }
      if (mapping.source === "env") {
        validateString(mapping.key, `${path}.key`, errors);
      } else if (mapping.source === "gateway") {
        validateString(mapping.ref, `${path}.ref`, errors);
      } else if (mapping.source === "file") {
        validateString(mapping.path, `${path}.path`, errors);
        const pathError = validateRelativePath(mapping.path, `${path}.path`);
        if (pathError) errors.push(issue(`${path}.path`, pathError));
      } else {
        errors.push(issue(`${path}.source`, "must be one of: env, gateway, file"));
      }
    }
  }

  if (Array.isArray(value.consumer) && isRecord(value.mapping)) {
    for (const consumer of value.consumer) {
      if (!isRecord(consumer) || typeof consumer.name !== "string") continue;
      if (!(consumer.name in value.mapping)) {
        errors.push(issue("secrets.mapping", `missing mapping for consumer: ${consumer.name}`));
      }
    }
  }

  if (value.audit !== undefined) {
    if (!isRecord(value.audit)) {
      errors.push(issue("secrets.audit", "must be an object"));
    } else {
      if (value.audit.logAccess !== undefined) validateBoolean(value.audit.logAccess, "secrets.audit.logAccess", errors);
      if (value.audit.redactInTranscripts !== undefined) {
        validateBoolean(value.audit.redactInTranscripts, "secrets.audit.redactInTranscripts", errors);
      }
    }
  }
}

function validateTools(value: unknown, errors: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(issue("tools", "must be an object"));
    return;
  }
  if (value.allow !== undefined) validateStringArray(value.allow, "tools.allow", errors);
  if (value.deny !== undefined) validateStringArray(value.deny, "tools.deny", errors);

  if (value.sandbox !== undefined) {
    if (!isRecord(value.sandbox)) {
      errors.push(issue("tools.sandbox", "must be an object"));
      return;
    }
    if (value.sandbox.mode !== undefined) {
      validateEnum(value.sandbox.mode, "tools.sandbox.mode", ["inherit", "require", "none"], errors);
    }
    if (value.sandbox.elevated !== undefined) validateBoolean(value.sandbox.elevated, "tools.sandbox.elevated", errors);

    if (value.sandbox.network !== undefined) validateNetworkPolicy(value.sandbox.network, errors);
    if (value.sandbox.filesystem !== undefined) validateFilesystemPolicy(value.sandbox.filesystem, errors);
  }
}

function validateNetworkPolicy(value: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(value)) {
    errors.push(issue("tools.sandbox.network", "must be an object"));
    return;
  }
  if (value.egress !== undefined) {
    validateEnum(value.egress, "tools.sandbox.network.egress", ["full", "restricted", "none"], errors);
  }
  if (value.allowedDomains !== undefined) validateStringArray(value.allowedDomains, "tools.sandbox.network.allowedDomains", errors);
  if (value.deniedDomains !== undefined) validateStringArray(value.deniedDomains, "tools.sandbox.network.deniedDomains", errors);
  if (value.dnsRebindingCheck !== undefined) validateBoolean(value.dnsRebindingCheck, "tools.sandbox.network.dnsRebindingCheck", errors);
  if (value.denyPrivateRanges !== undefined) validateBoolean(value.denyPrivateRanges, "tools.sandbox.network.denyPrivateRanges", errors);
}

function validateFilesystemPolicy(value: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(value)) {
    errors.push(issue("tools.sandbox.filesystem", "must be an object"));
    return;
  }
  for (const key of ["readPaths", "writePaths", "denyPaths"] as const) {
    if (value[key] !== undefined) validateStringArray(value[key], `tools.sandbox.filesystem.${key}`, errors);
  }
}

function validateChannels(value: unknown, errors: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value) || !Array.isArray(value.bindings)) {
    errors.push(issue("channels.bindings", "must be an array"));
    return;
  }
  for (const [index, binding] of value.bindings.entries()) {
    const path = `channels.bindings.${index}`;
    if (!isRecord(binding)) {
      errors.push(issue(path, "must be an object"));
      continue;
    }
    validateEnum(binding.channel, `${path}.channel`, ["discord", "telegram", "whatsapp", "signal"], errors);
    if (binding.channel === "discord") {
      validateString(binding.guildId, `${path}.guildId`, errors);
      validateString(binding.channelId, `${path}.channelId`, errors);
      if (binding.requireMention !== undefined) validateBoolean(binding.requireMention, `${path}.requireMention`, errors);
    } else if (binding.channel === "telegram") {
      validateString(binding.chatId, `${path}.chatId`, errors);
    } else if (binding.channel === "whatsapp" || binding.channel === "signal") {
      validateString(binding.phone, `${path}.phone`, errors);
    }
  }
}

function validateSchedules(value: unknown, errors: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(issue("schedules", "must be an array"));
    return;
  }
  for (const [index, schedule] of value.entries()) {
    const path = `schedules.${index}`;
    if (!isRecord(schedule)) {
      errors.push(issue(path, "must be an object"));
      continue;
    }
    validateString(schedule.name, `${path}.name`, errors);
    validateString(schedule.cron, `${path}.cron`, errors);
    if (schedule.tz !== undefined) validateString(schedule.tz, `${path}.tz`, errors);
    if (schedule.sessionTarget !== undefined) {
      validateEnum(schedule.sessionTarget, `${path}.sessionTarget`, ["isolated", "current"], errors);
    }
    if (!isRecord(schedule.payload)) {
      errors.push(issue(`${path}.payload`, "must be an object"));
    } else if (schedule.payload.kind === "agentTurn") {
      validateString(schedule.payload.message, `${path}.payload.message`, errors);
    } else if (schedule.payload.kind === "systemEvent") {
      validateString(schedule.payload.text, `${path}.payload.text`, errors);
    } else {
      errors.push(issue(`${path}.payload.kind`, "must be agentTurn or systemEvent"));
    }
  }
}

function validatePolicy(value: unknown, errors: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(issue("policy", "must be an object"));
    return;
  }
  if (value.scope !== undefined) validateEnum(value.scope, "policy.scope", ["package", "global"], errors);
  if (value.denyMutableInstructionFiles !== undefined) validateBoolean(value.denyMutableInstructionFiles, "policy.denyMutableInstructionFiles", errors);
  if (value.allowMutableUserInstructionFiles !== undefined) {
    validateBoolean(value.allowMutableUserInstructionFiles, "policy.allowMutableUserInstructionFiles", errors);
  }
  if (value.onUpgrade !== undefined) {
    validateEnum(value.onUpgrade, "policy.onUpgrade", ["preserve-custom", "reset", "prompt"], errors);
  }
  if (value.maxTokensPerTurn !== undefined && typeof value.maxTokensPerTurn !== "number") {
    errors.push(issue("policy.maxTokensPerTurn", "must be a number"));
  }
  if (value.allowedModels !== undefined) validateStringArray(value.allowedModels, "policy.allowedModels", errors);
}

function hasFileArrays(manifest: Partial<AgentPackageManifest>): manifest is Partial<AgentPackageManifest> & {
  files: { copy: FileCopyEntry[]; mutable: FileMutableEntry[] };
} {
  return (
    typeof manifest.files === "object" &&
    manifest.files !== null &&
    Array.isArray(manifest.files.copy) &&
    Array.isArray(manifest.files.mutable)
  );
}

function validateFilePaths(manifest: Partial<AgentPackageManifest>, packagePath: string): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (!hasFileArrays(manifest)) return errors;

  for (const [index, entry] of manifest.files.copy.entries()) {
    const path = `files.copy.${index}`;
    if (!isRecord(entry)) {
      errors.push(issue(path, "must be an object"));
      continue;
    }
    const src = resolvePackageFile(packagePath, entry.src, `${path}.src`);
    if (src.error) errors.push(issue(`${path}.src`, src.error));
    const dest = resolveWorkspacePath(packagePath, entry.dest, `${path}.dest`);
    if (dest.error) errors.push(issue(`${path}.dest`, dest.error));
  }

  for (const [index, entry] of manifest.files.mutable.entries()) {
    const path = `files.mutable.${index}`;
    if (!isRecord(entry)) {
      errors.push(issue(path, "must be an object"));
      continue;
    }
    const dest = resolveWorkspacePath(packagePath, entry.dest, `${path}.dest`);
    if (dest.error) errors.push(issue(`${path}.dest`, dest.error));
    if (entry.description !== undefined) validateString(entry.description, `${path}.description`, errors);
  }

  return errors;
}

function validateIntegrity(
  manifest: AgentPackageManifest,
  integrity: IntegrityManifest,
  packagePath: string,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (!hasFileArrays(manifest)) return errors;

  if (integrity.package.name !== manifest.name) {
    errors.push(issue("openclaw.integrity.json", `package name mismatch: ${integrity.package.name} vs ${manifest.name}`));
  }
  if (integrity.package.version !== manifest.version) {
    errors.push(issue("openclaw.integrity.json", `version mismatch: ${integrity.package.version} vs ${manifest.version}`));
  }
  if (integrity.algorithm !== "sha256") {
    errors.push(issue("openclaw.integrity.json", "algorithm must be sha256"));
  }

  for (const [dest, expectedHash] of Object.entries(integrity.files ?? {})) {
    const copyEntry = manifest.files.copy.find((entry) => entry.dest === dest);
    if (!copyEntry) {
      errors.push(issue("openclaw.integrity.json", `tracks ${dest} but no files.copy entry exists`));
      continue;
    }
    const filePath = resolve(packagePath, copyEntry.src);
    if (!existsSync(filePath)) {
      errors.push(issue("openclaw.integrity.json", `tracks ${dest} but source file is missing: ${copyEntry.src}`));
      continue;
    }
    const actualHash = hashFile(filePath);
    if (actualHash !== expectedHash) {
      errors.push(issue("openclaw.integrity.json", `integrity mismatch for ${dest}: file has changed since pack`));
    }
  }

  for (const entry of manifest.files.copy) {
    if (!(entry.dest in (integrity.files ?? {}))) {
      errors.push(issue("openclaw.integrity.json", `files.copy entry not tracked: ${entry.dest}`));
    }
  }

  return errors;
}

function validateMutableInstructionPolicy(manifest: Partial<AgentPackageManifest>): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (!hasFileArrays(manifest)) return errors;
  const denyMutable = manifest.policy?.denyMutableInstructionFiles !== false;
  if (!denyMutable) return errors;

  const allowUser = manifest.policy?.allowMutableUserInstructionFiles === true;

  for (const mutableEntry of manifest.files.mutable) {
    const mutableDest = normalizeManifestPath(mutableEntry.dest);
    for (const instrFile of INSTRUCTION_FILE_SET) {
      if (instrFile === "USER.md" && allowUser) continue;
      if (isSameOrInsidePath(mutableDest, instrFile) || isSameOrInsidePath(instrFile, mutableDest)) {
        errors.push(
          issue(
            "agent-package.json",
            `mutable path ${mutableEntry.dest} contains instruction file ${instrFile} but denyMutableInstructionFiles is true`,
          ),
        );
      }
    }

    for (const copyEntry of manifest.files.copy) {
      if (isSameOrInsidePath(mutableDest, copyEntry.dest)) {
        errors.push(
          issue(
            "agent-package.json",
            `mutable path ${mutableEntry.dest} overlaps copied immutable file ${copyEntry.dest}`,
          ),
        );
      }
    }
  }

  return errors;
}

export function runValidation(packagePath: string): {
  result: ValidationResult;
  integrity: IntegrityManifest | null;
} {
  const resolved = resolve(packagePath);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationWarning[] = [];

  const manifestPath = resolve(resolved, "agent-package.json");
  if (!existsSync(manifestPath)) {
    return {
      result: {
        valid: false,
        errors: [issue("agent-package.json", "not found")],
        warnings: [],
      },
      integrity: null,
    };
  }

  let rawManifest: unknown;
  try {
    rawManifest = loadJSON<unknown>(manifestPath);
  } catch (e) {
    return {
      result: {
        valid: false,
        errors: [issue("agent-package.json", `parse error: ${(e as Error).message}`)],
        warnings: [],
      },
      integrity: null,
    };
  }

  errors.push(...validateSchema(rawManifest));

  const manifest = rawManifest as Partial<AgentPackageManifest>;
  errors.push(...validateFilePaths(manifest, resolved));
  errors.push(...validateMutableInstructionPolicy(manifest));

  let integrity: IntegrityManifest | null = null;
  const integrityPath = resolve(resolved, "openclaw.integrity.json");
  if (existsSync(integrityPath)) {
    try {
      integrity = loadJSON<IntegrityManifest>(integrityPath);
      if (hasFileArrays(manifest)) {
        errors.push(...validateIntegrity(manifest as AgentPackageManifest, integrity, resolved));
      }
    } catch (e) {
      errors.push(issue("openclaw.integrity.json", `parse error: ${(e as Error).message}`));
    }
  } else {
    warnings.push({
      path: "openclaw.integrity.json",
      message: "not found; run 'pack' to generate",
    });
  }

  return {
    result: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    integrity,
  };
}

export const validateCommand = new Command("validate")
  .description("Validate manifest schema, integrity, paths, secrets, schedules, and mutable instruction policy")
  .argument("[path]", "Package directory", ".")
  .action(async (packagePath: string) => {
    const { result } = runValidation(packagePath);

    for (const warning of result.warnings) {
      console.warn(`  Warning: ${warning.path}: ${warning.message}`);
    }

    if (result.errors.length > 0) {
      console.error("Validation failed:");
      for (const error of result.errors) {
        console.error(`  - ${error.path}: ${error.message}`);
      }
      process.exit(1);
    }

    console.log("Validation passed.");
  });
