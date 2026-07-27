// @openclaw/agent-sdk — Mutation detection and quarantine for tracked package files.

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { hashFile } from "../hash.js";
import type { IntegrityManifest } from "../index.js";
import { resolveWorkspacePath } from "../paths.js";

export interface MutationCheckResult {
  /** Whether all tracked files match their expected hashes. */
  clean: boolean;
  /** Files that have been modified since pack. */
  mutated: MutatedFile[];
  /** Files that are missing. */
  missing: string[];
  /** Files that are clean. */
  cleanFiles: string[];
}

export interface MutatedFile {
  path: string;
  expectedHash: string;
  actualHash: string;
}

export interface QuarantineRecord {
  packageName: string;
  status: "active" | "lifted";
  quarantinedAt: string;
  liftedAt?: string;
  reason: string;
  mutations: MutatedFile[];
  missingFiles: string[];
}

const ACTIVE_QUARANTINE_FILE = "agent-sdk-quarantine.json";
const LIFTED_QUARANTINE_FILE = "agent-sdk-quarantine-lifted.json";

/**
 * Check all tracked package files against the integrity manifest.
 */
export function checkMutation(
  integrity: IntegrityManifest,
  workspacePath: string,
): MutationCheckResult {
  const mutated: MutatedFile[] = [];
  const missing: string[] = [];
  const cleanFiles: string[] = [];

  for (const [filePath, expectedHash] of Object.entries(integrity.files)) {
    const resolved = resolveWorkspacePath(workspacePath, filePath, "tracked file path");
    if (resolved.error || !resolved.path) {
      missing.push(filePath);
      continue;
    }

    if (!existsSync(resolved.path)) {
      missing.push(filePath);
      continue;
    }

    const actualHash = hashFile(resolved.path);
    if (actualHash !== expectedHash) {
      mutated.push({ path: filePath, expectedHash, actualHash });
    } else {
      cleanFiles.push(filePath);
    }
  }

  return {
    clean: mutated.length === 0 && missing.length === 0,
    mutated,
    missing,
    cleanFiles,
  };
}

/**
 * Quarantine a package by writing an active quarantine record.
 */
export function quarantinePackage(
  packageName: string,
  integrity: IntegrityManifest,
  workspacePath: string,
): QuarantineRecord {
  const check = checkMutation(integrity, workspacePath);

  const record: QuarantineRecord = {
    packageName,
    status: "active",
    quarantinedAt: new Date().toISOString(),
    reason: buildQuarantineReason(check),
    mutations: check.mutated,
    missingFiles: check.missing,
  };

  writeFileSync(
    resolve(workspacePath, ACTIVE_QUARANTINE_FILE),
    JSON.stringify(record, null, 2) + "\n",
    "utf8",
  );

  return record;
}

/**
 * Check if a package is currently quarantined.
 */
export function isQuarantined(workspacePath: string): boolean {
  const record = getQuarantineRecord(workspacePath);
  return record?.status === "active";
}

/**
 * Get the current quarantine record, if any.
 */
export function getQuarantineRecord(workspacePath: string): QuarantineRecord | null {
  const quarantinePath = resolve(workspacePath, ACTIVE_QUARANTINE_FILE);
  if (!existsSync(quarantinePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(quarantinePath, "utf8")) as Partial<QuarantineRecord>;
    if (parsed.status !== "active" && parsed.status !== "lifted") return null;
    return parsed as QuarantineRecord;
  } catch {
    return null;
  }
}

/**
 * Lift quarantine after operator review.
 */
export function liftQuarantine(workspacePath: string): boolean {
  const quarantinePath = resolve(workspacePath, ACTIVE_QUARANTINE_FILE);
  if (!existsSync(quarantinePath)) return false;

  const existing = getQuarantineRecord(workspacePath);
  const lifted: QuarantineRecord = {
    ...(existing ?? {
      packageName: "unknown",
      quarantinedAt: new Date().toISOString(),
      reason: "unknown",
      mutations: [],
      missingFiles: [],
    }),
    status: "lifted",
    liftedAt: new Date().toISOString(),
  };

  writeFileSync(
    resolve(workspacePath, LIFTED_QUARANTINE_FILE),
    JSON.stringify(lifted, null, 2) + "\n",
    "utf8",
  );
  rmSync(quarantinePath, { force: true });
  return true;
}

/**
 * Get the list of tools allowed in quarantine mode.
 */
export function getQuarantineToolAllowlist(): string[] {
  return ["read", "memory_get", "memory_search"];
}

/**
 * Check if a tool is allowed in quarantine mode.
 */
export function isToolAllowedInQuarantine(toolName: string): boolean {
  return getQuarantineToolAllowlist().includes(toolName);
}

function buildQuarantineReason(check: MutationCheckResult): string {
  const parts: string[] = [];
  if (check.mutated.length > 0) {
    parts.push(`${check.mutated.length} tracked file(s) modified`);
  }
  if (check.missing.length > 0) {
    parts.push(`${check.missing.length} tracked file(s) missing`);
  }
  return parts.join("; ") || "unknown";
}
