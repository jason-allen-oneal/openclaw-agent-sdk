import type { SecretMapping } from "../index.js";
export interface SecretResolution {
    value: string | undefined;
    error?: string;
}
export interface SecretEnvSource {
    type: "env";
    key: string;
}
export interface SecretGatewaySource {
    type: "gateway";
    ref: string;
}
export interface SecretFileSource {
    type: "file";
    path: string;
}
export type SecretSource = SecretEnvSource | SecretGatewaySource | SecretFileSource;
/**
 * Resolve a secret from its declared source.
 * Fail-closed: returns undefined + error message on any failure.
 * Never throws.
 */
export declare function resolveSecret(mapping: SecretMapping, workspacePath?: string): SecretResolution;
/**
 * Check whether a tool is in the allowed list for a given resource.
 */
export declare function isToolAllowed(toolName: string, allowList: string[] | undefined, globalDeny: string[] | undefined): boolean;
//# sourceMappingURL=secrets.d.ts.map