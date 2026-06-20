import type { AgentPackageManifest, ConfigDiff } from "../index.js";
export interface LiveConfigResult {
    success: boolean;
    applied: string[];
    rolledBack: string[];
    errors: string[];
}
/**
 * Apply a config diff to the workspace's agent-sdk-config.json.
 * Unflattens dot-path keys into nested objects, then deep-merges with existing config.
 */
export declare function applyConfigDiff(diff: ConfigDiff, workspacePath: string): LiveConfigResult;
/**
 * Rollback a partial config application.
 */
export declare function rollbackConfig(workspacePath: string, backup: Record<string, unknown>): boolean;
/**
 * Enable a package with full live config integration.
 */
export declare function enableWithLiveConfig(manifest: AgentPackageManifest, workspacePath: string): LiveConfigResult;
//# sourceMappingURL=live.d.ts.map