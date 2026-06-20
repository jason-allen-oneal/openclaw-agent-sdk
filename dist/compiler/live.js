// @openclaw/agent-sdk — Live config integration: apply compiled diff to workspace config.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "path";
import { compileManifest } from "./compiler.js";
/**
 * Set a nested value in an object using a dot-path key.
 */
function setNested(obj, dotPath, value) {
    const parts = dotPath.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}
/**
 * Deep merge two objects. Source values override target.
 */
function deepMerge(target, source) {
    const result = JSON.parse(JSON.stringify(target));
    for (const [key, value] of Object.entries(source)) {
        if (value !== null &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            result[key] !== null &&
            typeof result[key] === "object" &&
            !Array.isArray(result[key])) {
            result[key] = deepMerge(result[key], value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Apply a config diff to the workspace's agent-sdk-config.json.
 * Unflattens dot-path keys into nested objects, then deep-merges with existing config.
 */
export function applyConfigDiff(diff, workspacePath) {
    const applied = [];
    const errors = [];
    const configPath = resolve(workspacePath, "agent-sdk-config.json");
    try {
        // Load existing config or start fresh
        let existing = {};
        if (existsSync(configPath)) {
            try {
                existing = JSON.parse(readFileSync(configPath, "utf8"));
            }
            catch {
                existing = {};
            }
        }
        // Unflatten dot-path keys into a nested object
        const unflattened = {};
        for (const [key, value] of Object.entries(diff.changes)) {
            setNested(unflattened, key, value);
        }
        // Deep merge
        const merged = deepMerge(existing, unflattened);
        // Special handling: agentPackages.enabled should accumulate, not overwrite
        if (Array.isArray(unflattened.agentPackages?.enabled) &&
            Array.isArray(existing.agentPackages?.enabled)) {
            const existingEnabled = existing.agentPackages?.enabled;
            const newEnabled = unflattened.agentPackages?.enabled;
            const combined = Array.from(new Set([...existingEnabled ?? [], ...newEnabled ?? []]));
            if (!merged.agentPackages)
                merged.agentPackages = {};
            merged.agentPackages.enabled = combined;
        }
        writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
        applied.push(...Object.keys(diff.changes));
        return { success: true, applied, rolledBack: [], errors };
    }
    catch (e) {
        errors.push("config write failed: " + e.message);
        return { success: false, applied, rolledBack: [], errors };
    }
}
/**
 * Rollback a partial config application.
 */
export function rollbackConfig(workspacePath, backup) {
    try {
        writeFileSync(resolve(workspacePath, "agent-sdk-config.json"), JSON.stringify(backup, null, 2) + "\n", "utf8");
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Enable a package with full live config integration.
 */
export function enableWithLiveConfig(manifest, workspacePath) {
    const diff = compileManifest(manifest, { strict: false });
    const configPath = resolve(workspacePath, "agent-sdk-config.json");
    let backup = {};
    if (existsSync(configPath)) {
        try {
            backup = JSON.parse(readFileSync(configPath, "utf8"));
        }
        catch {
            backup = {};
        }
    }
    const result = applyConfigDiff(diff, workspacePath);
    if (!result.success) {
        const rolledBack = rollbackConfig(workspacePath, backup);
        return {
            success: false,
            applied: result.applied,
            rolledBack: rolledBack ? Object.keys(diff.changes) : [],
            errors: result.errors,
        };
    }
    return result;
}
