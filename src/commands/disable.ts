// @openclaw/agent-sdk — Disable command: remove package files and package-owned state.

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { hashFile } from "../hash.js";
import type { AgentPackageManifest, IntegrityManifest } from "../index.js";
import { resolveWorkspacePath } from "../paths.js";

function loadManifest(packagePath: string): AgentPackageManifest {
  const manifestPath = resolve(packagePath, "agent-package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`agent-package.json not found in ${packagePath}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as AgentPackageManifest;
}

function loadIntegrityManifest(packagePath: string): IntegrityManifest | null {
  const integrityPath = resolve(packagePath, "openclaw.integrity.json");
  if (!existsSync(integrityPath)) return null;
  return JSON.parse(readFileSync(integrityPath, "utf8")) as IntegrityManifest;
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function removeCopiedFiles(
  manifest: AgentPackageManifest,
  workspacePath: string,
  integrity: IntegrityManifest | null,
  force: boolean,
): { removed: string[]; skipped: string[] } {
  const removed: string[] = [];
  const skipped: string[] = [];

  for (const [index, entry] of manifest.files.copy.entries()) {
    const dest = resolveWorkspacePath(workspacePath, entry.dest, `files.copy.${index}.dest`);
    if (dest.error || !dest.path) {
      skipped.push(entry.dest);
      continue;
    }

    if (!existsSync(dest.path)) continue;

    if (!integrity?.files[entry.dest]) {
      if (!force) {
        skipped.push(entry.dest);
        continue;
      }
    } else {
      const currentHash = hashFile(dest.path);
      if (currentHash !== integrity.files[entry.dest] && !force) {
        skipped.push(entry.dest);
        continue;
      }
    }

    rmSync(dest.path, { force: true });
    removed.push(entry.dest);
  }

  return { removed, skipped };
}

function unregisterPackage(packageName: string, workspacePath: string): boolean {
  const registryPath = resolve(workspacePath, "agent-sdk-registry.json");
  const registry = readJsonObject(registryPath);
  if (!(packageName in registry)) return false;
  delete registry[packageName];
  writeJson(registryPath, registry);
  return true;
}

function removePackageMapEntry(filename: string, packageName: string, workspacePath: string): boolean {
  const path = resolve(workspacePath, filename);
  const map = readJsonObject(path);
  if (!(packageName in map)) return false;
  delete map[packageName];
  writeJson(path, map);
  return true;
}

function removePackageConfig(packageName: string, workspacePath: string): boolean {
  const configPath = resolve(workspacePath, "agent-sdk-config.json");
  const config = readJsonObject(configPath);
  const agentPackages = config.agentPackages as Record<string, unknown> | undefined;
  if (!agentPackages || typeof agentPackages !== "object") return false;

  let changed = false;
  if (Array.isArray(agentPackages.enabled)) {
    const next = agentPackages.enabled.filter((name) => name !== packageName);
    changed = changed || next.length !== agentPackages.enabled.length;
    agentPackages.enabled = next;
  }

  const registry = agentPackages.registry as Record<string, unknown> | undefined;
  if (registry && typeof registry === "object" && packageName in registry) {
    delete registry[packageName];
    changed = true;
  }

  const packages = agentPackages.packages as Record<string, unknown> | undefined;
  if (packages && typeof packages === "object" && packageName in packages) {
    delete packages[packageName];
    changed = true;
  }

  if (changed) writeJson(configPath, config);
  return changed;
}

export const disableCommand = new Command("disable")
  .description("Remove copied files, unregister, and clean package-owned workspace artifacts")
  .argument("[path]", "Package directory", ".")
  .option("--workspace <path>", "Target workspace directory", ".")
  .option("--force", "Remove modified or untracked copied files", false)
  .action(async (packagePath: string, options: { workspace?: string; force?: boolean }) => {
    const resolved = resolve(packagePath);
    const workspacePath = options.workspace ? resolve(options.workspace) : resolved;

    let manifest: AgentPackageManifest;
    try {
      manifest = loadManifest(resolved);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    const integrity = loadIntegrityManifest(resolved);
    const { removed, skipped } = removeCopiedFiles(manifest, workspacePath, integrity, options.force === true);

    if (removed.length > 0) console.log(`Removed ${removed.length} copied files.`);
    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} copied files (use --force to remove modified or untracked files).`);
      for (const s of skipped) console.log(`  - ${s}`);
    }

    if (unregisterPackage(manifest.name, workspacePath)) console.log(`Unregistered ${manifest.name}.`);
    if (removePackageConfig(manifest.name, workspacePath)) console.log("Removed package config state.");

    const bindingsRemoved = removePackageMapEntry("agent-sdk-bindings.json", manifest.name, workspacePath);
    const schedulesRemoved = removePackageMapEntry("agent-sdk-schedules.json", manifest.name, workspacePath);
    const generatedCount = [bindingsRemoved, schedulesRemoved].filter(Boolean).length;
    if (generatedCount > 0) console.log(`Removed ${generatedCount} package-owned generated entries.`);

    console.log(`\n✓ ${manifest.name}@${manifest.version} disabled.`);
  });
