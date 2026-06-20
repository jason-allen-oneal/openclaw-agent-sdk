import type { NetworkPolicy } from "../index.js";
export interface EgressCheckResult {
    allowed: boolean;
    reason?: string;
}
/**
 * Validate network egress for a given domain.
 *
 * Enforcement order:
 * 1. If egress is "none" → deny all.
 * 2. Denied domains always win (takes precedence over allowed).
 * 3. If allowed domains list exists, domain must be in it.
 * 4. If egress is "restricted" and no allowed list → deny.
 * 5. If egress is "full" → allow (unless denied).
 */
export declare function checkNetworkEgress(domain: string, policy: NetworkPolicy): EgressCheckResult;
/**
 * Check if an IP address is in a denied private range.
 * Used for DNS rebinding protection.
 *
 * Note: This is a string-based check. For production use, the net-policy
 * package (@openclaw/net-policy) provides full IP range matching via ipaddr.js.
 * This function provides a lightweight check for common private ranges.
 */
export declare function isPrivateIp(ip: string, denyRanges?: string[]): {
    isPrivate: boolean;
    matchedRange?: string;
};
/**
 * Full DNS rebinding check.
 * 1. Check domain against denied/allowed lists.
 * 2. Check resolved IP against private ranges.
 * Returns on first failure.
 */
export declare function checkDnsRebinding(domain: string, resolvedIp: string, policy: NetworkPolicy): EgressCheckResult;
//# sourceMappingURL=network.d.ts.map