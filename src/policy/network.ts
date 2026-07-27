// @openclaw/agent-sdk — Network policy enforcement (DNS rebinding protection, egress control).

import {
  isBlockedSpecialUseIpv4Address,
  isBlockedSpecialUseIpv6Address,
  isIpInCidr,
  isIpv4Address,
  isIpv6Address,
  parseCanonicalIpAddress,
} from "../net-policy/ip.js";
import { DEFAULT_DENY_PRIVATE_RANGES } from "../index.js";
import type { NetworkPolicy } from "../index.js";

export interface EgressCheckResult {
  allowed: boolean;
  reason?: string;
}

function normalizeDomain(domain: string): string | null {
  const lower = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (!lower || lower.includes("://") || /[/?#@]/.test(lower)) return null;
  return lower;
}

/**
 * Check whether a domain is in the denied list.
 * Supports exact match and wildcard prefix (*.example.com).
 */
function isDeniedDomain(domain: string, deniedDomains: string[]): boolean {
  const lower = normalizeDomain(domain);
  if (!lower) return true;
  for (const pattern of deniedDomains) {
    const lowerPattern = normalizeDomain(pattern);
    if (!lowerPattern) continue;
    if (lowerPattern.startsWith("*.")) {
      const suffix = lowerPattern.slice(1);
      if (lower === lowerPattern.slice(2) || lower.endsWith(suffix)) {
        return true;
      }
    } else if (lower === lowerPattern) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a domain is in the allowed list.
 * Supports exact match and wildcard prefix (*.example.com).
 */
function isAllowedDomain(domain: string, allowedDomains: string[]): boolean {
  const lower = normalizeDomain(domain);
  if (!lower) return false;
  for (const pattern of allowedDomains) {
    const lowerPattern = normalizeDomain(pattern);
    if (!lowerPattern) continue;
    if (lowerPattern.startsWith("*.")) {
      const suffix = lowerPattern.slice(1);
      if (lower === lowerPattern.slice(2) || lower.endsWith(suffix)) {
        return true;
      }
    } else if (lower === lowerPattern) {
      return true;
    }
  }
  return false;
}

/**
 * Validate network egress for a given domain.
 */
export function checkNetworkEgress(domain: string, policy: NetworkPolicy): EgressCheckResult {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    return { allowed: false, reason: `invalid domain: ${domain}` };
  }

  if (policy.egress === "none") {
    return { allowed: false, reason: "network egress is disabled (egress=none)" };
  }

  if (policy.denyPrivateRanges !== false) {
    const ipCheck = isPrivateIp(normalizedDomain);
    if (ipCheck.isPrivate) {
      return { allowed: false, reason: `IP target is denied: ${normalizedDomain} (${ipCheck.matchedRange})` };
    }
  }

  const deniedDomains = policy.deniedDomains ?? [];
  if (isDeniedDomain(normalizedDomain, deniedDomains)) {
    return { allowed: false, reason: `domain is denied: ${normalizedDomain}` };
  }

  const allowedDomains = policy.allowedDomains ?? [];
  if (allowedDomains.length > 0) {
    if (!isAllowedDomain(normalizedDomain, allowedDomains)) {
      return { allowed: false, reason: `domain not in allowed list: ${normalizedDomain}` };
    }
    return { allowed: true };
  }

  if (policy.egress === "restricted") {
    return { allowed: false, reason: `restricted egress with no allowed list: ${normalizedDomain}` };
  }

  return { allowed: true };
}

/**
 * Check if an IP address is in a denied range.
 */
export function isPrivateIp(
  ip: string,
  denyRanges: readonly string[] = DEFAULT_DENY_PRIVATE_RANGES,
): {
  isPrivate: boolean;
  matchedRange?: string;
} {
  const parsed = parseCanonicalIpAddress(ip);
  if (!parsed) return { isPrivate: false };

  for (const range of denyRanges) {
    if (isIpInCidr(parsed.toString(), range)) {
      return { isPrivate: true, matchedRange: range };
    }
  }

  if (isIpv4Address(parsed) && isBlockedSpecialUseIpv4Address(parsed)) {
    return { isPrivate: true, matchedRange: parsed.range() };
  }
  if (isIpv6Address(parsed) && isBlockedSpecialUseIpv6Address(parsed)) {
    return { isPrivate: true, matchedRange: parsed.range() };
  }
  return { isPrivate: false };
}

/**
 * Full DNS rebinding check.
 */
export function checkDnsRebinding(
  domain: string,
  resolvedIp: string,
  policy: NetworkPolicy,
): EgressCheckResult {
  const domainResult = checkNetworkEgress(domain, policy);
  if (!domainResult.allowed) {
    return domainResult;
  }

  if (policy.dnsRebindingCheck === false || policy.denyPrivateRanges === false) {
    return { allowed: true };
  }

  const ipCheck = isPrivateIp(resolvedIp);
  if (ipCheck.isPrivate) {
    return {
      allowed: false,
      reason: `DNS rebinding: ${domain} resolved to denied IP ${resolvedIp} (${ipCheck.matchedRange})`,
    };
  }

  return { allowed: true };
}
