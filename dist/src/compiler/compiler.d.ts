import type { AgentPackageManifest } from "../index.js";
export interface ConfigDiff {
    /** Dot-path → new value for each changed field. */
    changes: Record<string, unknown>;
    /** Dot-paths that would be removed. */
    removals: string[];
    /** Fields in the manifest that don't map to any known config path. */
    unsupported: string[];
    /** Warnings (non-fatal). */
    warnings: string[];
}
export interface CompilerOptions {
    /** If true, reject any unsupported fields. Default: true. */
    strict?: boolean;
}
/**
 * Compile an agent-package manifest into a config diff.
 * No writes. Pure computation.
 */
export declare function compileManifest(manifest: AgentPackageManifest, options?: CompilerOptions): ConfigDiff;
/**
 * Round-trip validation: compile → decompile → compare.
 * Returns true if the round-trip is lossless.
 */
export declare function validateRoundTrip(manifest: AgentPackageManifest): {
    lossless: boolean;
    diff: ConfigDiff;
    missing: string[];
};
//# sourceMappingURL=compiler.d.ts.map