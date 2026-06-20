// Network Policy module implements ip behavior.
import ipaddr from "ipaddr.js";
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
function normalizeLowercaseStringOrEmpty(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
const BLOCKED_IPV4_SPECIAL_USE_RANGES = new Set([
    "unspecified",
    "broadcast",
    "multicast",
    "linkLocal",
    "loopback",
    "carrierGradeNat",
    "private",
    "reserved",
]);
const PRIVATE_OR_LOOPBACK_IPV4_RANGES = new Set([
    "loopback",
    "private",
    "linkLocal",
    "carrierGradeNat",
]);
const BLOCKED_IPV6_SPECIAL_USE_RANGES = new Set([
    "unspecified",
    "loopback",
    "linkLocal",
    "uniqueLocal",
    "multicast",
    "reserved",
    "benchmarking",
    "discard",
    "orchid2",
]);
const RFC2544_BENCHMARK_PREFIX = [ipaddr.IPv4.parse("198.18.0.0"), 15];
const CLOUD_METADATA_IP_ADDRESSES = new Set(["100.100.100.200", "fd00:ec2::254"]);
const EMBEDDED_IPV4_SENTINEL_RULES = [
    {
        // IPv4-compatible form ::w.x.y.z (deprecated, but still seen in parser edge-cases).
        matches: (parts) => parts[0] === 0 &&
            parts[1] === 0 &&
            parts[2] === 0 &&
            parts[3] === 0 &&
            parts[4] === 0 &&
            parts[5] === 0,
        toHextets: (parts) => [parts[6], parts[7]],
    },
    {
        // NAT64 local-use prefix: 64:ff9b:1::/48.
        matches: (parts) => parts[0] === 0x0064 &&
            parts[1] === 0xff9b &&
            parts[2] === 0x0001 &&
            parts[3] === 0 &&
            parts[4] === 0 &&
            parts[5] === 0,
        toHextets: (parts) => [parts[6], parts[7]],
    },
    {
        // 6to4 prefix: 2002::/16 (IPv4 lives in hextets 1..2).
        matches: (parts) => parts[0] === 0x2002,
        toHextets: (parts) => [parts[1], parts[2]],
    },
    {
        // Teredo prefix: 2001:0000::/32 (client IPv4 XOR 0xffff in hextets 6..7).
        matches: (parts) => parts[0] === 0x2001 && parts[1] === 0x0000,
        toHextets: (parts) => [parts[6] ^ 0xffff, parts[7] ^ 0xffff],
    },
    {
        // ISATAP IID marker: ....:0000:5efe:w.x.y.z with u/g bits allowed in hextet 4.
        matches: (parts) => (parts[4] & 0xfcff) === 0 && parts[5] === 0x5efe,
        toHextets: (parts) => [parts[6], parts[7]],
    },
];
function stripIpv6Brackets(value) {
    if (value.startsWith("[") && value.endsWith("]")) {
        return value.slice(1, -1);
    }
    return value;
}
function isNumericIpv4LiteralPart(value) {
    return /^[0-9]+$/.test(value) || /^0x[0-9a-f]+$/i.test(value);
}
function parseIpv6WithEmbeddedIpv4(raw) {
    if (!raw.includes(":") || !raw.includes(".")) {
        return undefined;
    }
    const match = /^(.*:)([^:%]+(?:\.[^:%]+){3})(%[0-9A-Za-z]+)?$/i.exec(raw);
    if (!match) {
        return undefined;
    }
    const [, prefix, embeddedIpv4, zoneSuffix = ""] = match;
    if (!ipaddr.IPv4.isValidFourPartDecimal(embeddedIpv4)) {
        return undefined;
    }
    const octets = embeddedIpv4.split(".").map((part) => Number.parseInt(part, 10));
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    const normalizedIpv6 = `${prefix}${high}:${low}${zoneSuffix}`;
    if (!ipaddr.IPv6.isValid(normalizedIpv6)) {
        return undefined;
    }
    return ipaddr.IPv6.parse(normalizedIpv6);
}
/** Type guard for parsed IPv4 addresses. */
export function isIpv4Address(address) {
    return address.kind() === "ipv4";
}
/** Type guard for parsed IPv6 addresses. */
export function isIpv6Address(address) {
    return address.kind() === "ipv6";
}
function normalizeIpv4MappedAddress(address) {
    if (!isIpv6Address(address)) {
        return address;
    }
    if (!address.isIPv4MappedAddress()) {
        return address;
    }
    return address.toIPv4Address();
}
function normalizeIpParseInput(raw) {
    const trimmed = normalizeOptionalString(raw);
    if (!trimmed) {
        return undefined;
    }
    return stripIpv6Brackets(trimmed);
}
/** Parses canonical IPv4/IPv6 literals, rejecting legacy IPv4 shorthand forms. */
export function parseCanonicalIpAddress(raw) {
    const normalized = normalizeIpParseInput(raw);
    if (!normalized) {
        return undefined;
    }
    if (ipaddr.IPv4.isValid(normalized)) {
        if (!ipaddr.IPv4.isValidFourPartDecimal(normalized)) {
            return undefined;
        }
        return ipaddr.IPv4.parse(normalized);
    }
    if (ipaddr.IPv6.isValid(normalized)) {
        return ipaddr.IPv6.parse(normalized);
    }
    return parseIpv6WithEmbeddedIpv4(normalized);
}
/** Parses canonical IP literals plus legacy IPv4 forms needed for SSRF checks. */
export function parseLooseIpAddress(raw) {
    const normalized = normalizeIpParseInput(raw);
    if (!normalized) {
        return undefined;
    }
    if (ipaddr.isValid(normalized)) {
        return ipaddr.parse(normalized);
    }
    return parseIpv6WithEmbeddedIpv4(normalized);
}
/** Normalizes canonical IP literals and maps IPv4-mapped IPv6 addresses to IPv4 text. */
export function normalizeIpAddress(raw) {
    const parsed = parseCanonicalIpAddress(raw);
    if (!parsed) {
        return undefined;
    }
    const normalized = normalizeIpv4MappedAddress(parsed);
    return normalizeLowercaseStringOrEmpty(normalized.toString());
}
/** True only for canonical four-part dotted-decimal IPv4 literals. */
export function isCanonicalDottedDecimalIPv4(raw) {
    const trimmed = normalizeOptionalString(raw);
    if (!trimmed) {
        return false;
    }
    const normalized = stripIpv6Brackets(trimmed);
    if (!normalized) {
        return false;
    }
    return ipaddr.IPv4.isValidFourPartDecimal(normalized);
}
/** Detects legacy numeric IPv4 forms that canonical parsing deliberately rejects. */
export function isLegacyIpv4Literal(raw) {
    const trimmed = normalizeOptionalString(raw);
    if (!trimmed) {
        return false;
    }
    const normalized = stripIpv6Brackets(trimmed);
    if (!normalized || normalized.includes(":")) {
        return false;
    }
    if (isCanonicalDottedDecimalIPv4(normalized)) {
        return false;
    }
    const parts = normalized.split(".");
    if (parts.length === 0 || parts.length > 4) {
        return false;
    }
    if (parts.some((part) => part.length === 0)) {
        return false;
    }
    if (!parts.every((part) => isNumericIpv4LiteralPart(part))) {
        return false;
    }
    return true;
}
/** True when a canonical IP literal is loopback, including IPv4-mapped IPv6. */
export function isLoopbackIpAddress(raw) {
    const parsed = parseCanonicalIpAddress(raw);
    if (!parsed) {
        return false;
    }
    const normalized = normalizeIpv4MappedAddress(parsed);
    return normalized.range() === "loopback";
}
/** True for link-local IPs, including legacy and embedded-IPv4 forms. */
export function isLinkLocalIpAddress(raw) {
    const parsed = parseLooseIpAddress(raw);
    if (!parsed) {
        return false;
    }
    const normalized = normalizeIpv4MappedAddress(parsed);
    if (isIpv4Address(normalized)) {
        return normalized.range() === "linkLocal";
    }
    const embeddedIpv4 = extractEmbeddedIpv4FromIpv6(normalized);
    if (embeddedIpv4?.range() === "linkLocal") {
        return true;
    }
    return normalized.range() === "linkLocal";
}
/** True for cloud metadata IP literals, including mapped and embedded forms. */
export function isCloudMetadataIpAddress(raw) {
    const parsed = parseLooseIpAddress(raw);
    if (!parsed) {
        return false;
    }
    const normalized = normalizeIpv4MappedAddress(parsed);
    if (isIpv6Address(normalized)) {
        const embeddedIpv4 = extractEmbeddedIpv4FromIpv6(normalized);
        if (embeddedIpv4 && CLOUD_METADATA_IP_ADDRESSES.has(embeddedIpv4.toString())) {
            return true;
        }
    }
    return CLOUD_METADATA_IP_ADDRESSES.has(normalized.toString());
}
/** True for canonical private, loopback, link-local, or blocked special-use IPs. */
export function isPrivateOrLoopbackIpAddress(raw) {
    const parsed = parseCanonicalIpAddress(raw);
    if (!parsed) {
        return false;
    }
    const normalized = normalizeIpv4MappedAddress(parsed);
    if (isIpv4Address(normalized)) {
        return PRIVATE_OR_LOOPBACK_IPV4_RANGES.has(normalized.range());
    }
    return isBlockedSpecialUseIpv6Address(normalized);
}
/** Applies the SSRF block policy for parsed IPv6 special-use ranges. */
export function isBlockedSpecialUseIpv6Address(address, options = {}) {
    // ipaddr.js returns "discard" at runtime for 100::/64, but its published
    // TypeScript IPv6Range union omits that literal.
    const range = address.range();
    if (range === "uniqueLocal" && options.allowUniqueLocalRange === true) {
        // Operators running fake-ip proxy stacks (sing-box, Clash, Surge) opt in
        // to fc00::/7 reaching the network — same intent as
        // `allowRfc2544BenchmarkRange` for the IPv4 side (#74351).
        return false;
    }
    if (BLOCKED_IPV6_SPECIAL_USE_RANGES.has(range)) {
        return true;
    }
    // ipaddr.js does not classify deprecated site-local fec0::/10 as private.
    return (address.parts[0] & 0xffc0) === 0xfec0;
}
/** True for canonical IPv4 literals in RFC 1918 private ranges. */
export function isRfc1918Ipv4Address(raw) {
    const parsed = parseCanonicalIpAddress(raw);
    if (!parsed || !isIpv4Address(parsed)) {
        return false;
    }
    return parsed.range() === "private";
}
/** True for canonical IPv4 literals in the carrier-grade NAT range. */
export function isCarrierGradeNatIpv4Address(raw) {
    const parsed = parseCanonicalIpAddress(raw);
    if (!parsed || !isIpv4Address(parsed)) {
        return false;
    }
    return parsed.range() === "carrierGradeNat";
}
/** Applies the SSRF block policy for parsed IPv4 special-use ranges. */
export function isBlockedSpecialUseIpv4Address(address, options = {}) {
    const inRfc2544BenchmarkRange = address.match(RFC2544_BENCHMARK_PREFIX);
    if (inRfc2544BenchmarkRange && options.allowRfc2544BenchmarkRange === true) {
        return false;
    }
    return BLOCKED_IPV4_SPECIAL_USE_RANGES.has(address.range()) || inRfc2544BenchmarkRange;
}
function decodeIpv4FromHextets(high, low) {
    const octets = [
        (high >>> 8) & 0xff,
        high & 0xff,
        (low >>> 8) & 0xff,
        low & 0xff,
    ];
    return ipaddr.IPv4.parse(octets.join("."));
}
/** Extracts embedded IPv4 addresses from mapped and transition IPv6 prefixes. */
export function extractEmbeddedIpv4FromIpv6(address) {
    if (address.isIPv4MappedAddress()) {
        return address.toIPv4Address();
    }
    if (address.range() === "rfc6145") {
        return decodeIpv4FromHextets(address.parts[6], address.parts[7]);
    }
    if (address.range() === "rfc6052") {
        return decodeIpv4FromHextets(address.parts[6], address.parts[7]);
    }
    for (const rule of EMBEDDED_IPV4_SENTINEL_RULES) {
        if (!rule.matches(address.parts)) {
            continue;
        }
        const [high, low] = rule.toHextets(address.parts);
        return decodeIpv4FromHextets(high, low);
    }
    return undefined;
}
/** Checks an IP literal against an exact IP or CIDR range, normalizing mapped IPv4. */
export function isIpInCidr(ip, cidr) {
    const normalizedIp = parseCanonicalIpAddress(ip);
    if (!normalizedIp) {
        return false;
    }
    const candidate = cidr.trim();
    if (!candidate) {
        return false;
    }
    const comparableIp = normalizeIpv4MappedAddress(normalizedIp);
    if (!candidate.includes("/")) {
        const exact = parseCanonicalIpAddress(candidate);
        if (!exact) {
            return false;
        }
        const comparableExact = normalizeIpv4MappedAddress(exact);
        return (comparableIp.kind() === comparableExact.kind() &&
            comparableIp.toString() === comparableExact.toString());
    }
    let parsedCidr;
    try {
        parsedCidr = ipaddr.parseCIDR(candidate);
    }
    catch {
        return false;
    }
    const [baseAddress, prefixLength] = parsedCidr;
    const comparableBase = normalizeIpv4MappedAddress(baseAddress);
    if (comparableIp.kind() !== comparableBase.kind()) {
        return false;
    }
    try {
        if (isIpv4Address(comparableIp) && isIpv4Address(comparableBase)) {
            return comparableIp.match([comparableBase, prefixLength]);
        }
        if (isIpv6Address(comparableIp) && isIpv6Address(comparableBase)) {
            return comparableIp.match([comparableBase, prefixLength]);
        }
        return false;
    }
    catch {
        return false;
    }
}
