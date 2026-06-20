import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
export * from "./src/index.js";
export { resolveSecret, isToolAllowed } from "./src/policy/secrets.js";
export { checkNetworkEgress, isPrivateIp, checkDnsRebinding } from "./src/policy/network.js";
export { compileManifest, validateRoundTrip } from "./src/compiler/compiler.js";
export { checkMutation, quarantinePackage, isQuarantined, getQuarantineRecord, liftQuarantine, isToolAllowedInQuarantine } from "./src/quarantine/mutation.js";
export { hashFile, hashString } from "./src/hash.js";
declare const entry: OpenClawPluginDefinition;
export default entry;
//# sourceMappingURL=index.d.ts.map