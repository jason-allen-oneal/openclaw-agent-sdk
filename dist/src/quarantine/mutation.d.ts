import type { IntegrityManifest } from "../index.js";
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
    quarantinedAt: string;
    reason: string;
    mutations: MutatedFile[];
    missingFiles: string[];
}
/**
 * Check all tracked instruction files against the integrity manifest.
 * Returns detailed result for each file.
 */
export declare function checkMutation(integrity: IntegrityManifest, workspacePath: string): MutationCheckResult;
/**
 * Quarantine a package: write quarantine record, restrict tools to read-only.
 */
export declare function quarantinePackage(packageName: string, integrity: IntegrityManifest, workspacePath: string): QuarantineRecord;
/**
 * Check if a package is currently quarantined.
 */
export declare function isQuarantined(workspacePath: string): boolean;
/**
 * Get the current quarantine record, if any.
 */
export declare function getQuarantineRecord(workspacePath: string): QuarantineRecord | null;
/**
 * Lift quarantine: remove the quarantine record.
 * Should only be called after operator review.
 */
export declare function liftQuarantine(workspacePath: string): boolean;
/**
 * Get the list of tools allowed in quarantine mode (read-only).
 */
export declare function getQuarantineToolAllowlist(): string[];
/**
 * Check if a tool is allowed in quarantine mode.
 */
export declare function isToolAllowedInQuarantine(toolName: string): boolean;
//# sourceMappingURL=mutation.d.ts.map