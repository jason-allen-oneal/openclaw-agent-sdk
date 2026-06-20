import type { AgentPackageManifest, ConfigDiff } from "../index.js";
export interface UpgradeOptions {
    onUpgrade?: "preserve-custom" | "reset" | "prompt";
}
export interface UpgradeResult {
    oldVersion: string;
    newVersion: string;
    diff: ConfigDiff;
    preserved: string[];
    reset: string[];
    added: string[];
    removed: string[];
}
/**
 * Compute the upgrade diff from an old manifest to a new one.
 * No scripts, no hooks — purely declarative field-level diff.
 */
export declare function computeUpgrade(oldManifest: AgentPackageManifest, newManifest: AgentPackageManifest, options?: UpgradeOptions): UpgradeResult;
/**
 * Validate that an upgrade is safe (no destructive changes).
 */
export declare function validateUpgrade(result: UpgradeResult): {
    safe: boolean;
    warnings: string[];
};
//# sourceMappingURL=upgrade.d.ts.map