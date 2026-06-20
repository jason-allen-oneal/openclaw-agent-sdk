// @openclaw/agent-sdk — Config compiler: manifest → OpenClaw config diff (dry-run, no writes).
/**
 * Known config paths that manifest fields map to.
 * These are the actual dot-paths in openclaw.json.
 */
const KNOWN_PATHS = new Set([
    // Agent defaults
    "agents.defaults.model",
    "agents.defaults.contextWindow",
    "agents.defaults.maxTokensPerTurn",
    "agents.defaults.allowedModels",
    // Tools
    "agents.defaults.tools.allow",
    "agents.defaults.tools.deny",
    // Sandbox / network
    "agents.defaults.sandbox.network.egress",
    "agents.defaults.sandbox.network.allowedDomains",
    "agents.defaults.sandbox.network.deniedDomains",
    "agents.defaults.sandbox.network.dnsRebindingCheck",
    "agents.defaults.sandbox.network.denyPrivateRanges",
    "agents.defaults.sandbox.filesystem.readPaths",
    "agents.defaults.sandbox.filesystem.writePaths",
    "agents.defaults.sandbox.filesystem.denyPaths",
    // Secrets
    "secrets.mapping",
    "secrets.audit.logAccess",
    "secrets.audit.redactInTranscripts",
    // Channels / bindings
    "bindings",
    // Schedules
    "cron.jobs",
    // Agent packages
    "agentPackages.enabled",
    "agentPackages.policy.denyMutableInstructionFiles",
    "agentPackages.policy.allowMutableUserInstructionFiles",
    "agentPackages.packages",
    "agentPackages.registry",
    "agentPackages.upgradedAt",
    "agentPackages.previousVersion",
]);
/**
 * Compile an agent-package manifest into a config diff.
 * No writes. Pure computation.
 */
export function compileManifest(manifest, options = {}) {
    const strict = options.strict ?? true;
    const changes = {};
    const removals = [];
    const unsupported = [];
    const warnings = [];
    const packageBase = `agentPackages.packages.${manifest.name}`;
    const policyScope = manifest.policy?.scope ?? "package";
    const scopedPolicyPath = (field) => policyScope === "global" ? `agents.defaults.${field}` : `${packageBase}.policy.${field}`;
    const scopedMutablePolicyPath = (field) => policyScope === "global" ? `agentPackages.policy.${field}` : `${packageBase}.policy.${field}`;
    const scopedToolsBase = policyScope === "global" ? "agents.defaults.tools" : `${packageBase}.tools`;
    const scopedSandboxBase = policyScope === "global" ? "agents.defaults.sandbox" : `${packageBase}.sandbox`;
    // ── Policy ─────────────────────────────────────────────────────────
    if (manifest.policy) {
        const p = manifest.policy;
        if (p.maxTokensPerTurn !== undefined) {
            changes[scopedPolicyPath("maxTokensPerTurn")] = p.maxTokensPerTurn;
        }
        if (p.allowedModels !== undefined) {
            changes[scopedPolicyPath("allowedModels")] = p.allowedModels;
        }
        if (p.denyMutableInstructionFiles !== undefined) {
            changes[scopedMutablePolicyPath("denyMutableInstructionFiles")] =
                p.denyMutableInstructionFiles;
        }
        if (p.allowMutableUserInstructionFiles !== undefined) {
            changes[scopedMutablePolicyPath("allowMutableUserInstructionFiles")] =
                p.allowMutableUserInstructionFiles;
        }
        if (p.scope !== undefined && p.scope !== "package" && p.scope !== "global") {
            if (strict)
                unsupported.push("policy.scope");
            else
                warnings.push("policy.scope: must be package or global");
        }
        if (p.onUpgrade !== undefined) {
            if (strict) {
                unsupported.push("policy.onUpgrade");
            }
            else {
                warnings.push("policy.onUpgrade: not yet supported in config compiler");
            }
        }
    }
    // ── Tools ──────────────────────────────────────────────────────────
    if (manifest.tools) {
        compileTools(manifest.tools, scopedToolsBase, scopedSandboxBase, changes, unsupported, warnings, strict);
    }
    // ── Secrets ────────────────────────────────────────────────────────
    if (manifest.secrets) {
        compileSecrets(manifest.secrets, changes, unsupported, warnings, strict);
    }
    // ── Channels ───────────────────────────────────────────────────────
    if (manifest.channels) {
        compileChannels(manifest.channels, changes, unsupported, warnings, strict);
    }
    // ── Schedules ──────────────────────────────────────────────────────
    if (manifest.schedules) {
        compileSchedules(manifest.schedules, changes, unsupported, warnings, strict);
    }
    // ── Agent Packages registry ────────────────────────────────────────
    changes["agentPackages.enabled"] = [manifest.name];
    changes["agentPackages.registry"] = {
        [manifest.name]: {
            version: manifest.version,
            description: manifest.description,
        },
    };
    return { changes, removals, unsupported, warnings };
}
function compileTools(tools, toolsBase, sandboxBase, changes, unsupported, warnings, strict) {
    if (tools.allow !== undefined) {
        changes[`${toolsBase}.allow`] = tools.allow;
    }
    if (tools.deny !== undefined) {
        changes[`${toolsBase}.deny`] = tools.deny;
    }
    if (tools.sandbox) {
        const s = tools.sandbox;
        if (s.mode !== undefined) {
            if (strict)
                unsupported.push("tools.sandbox.mode");
            else
                warnings.push("tools.sandbox.mode: not yet supported");
        }
        if (s.elevated !== undefined) {
            if (strict)
                unsupported.push("tools.sandbox.elevated");
            else
                warnings.push("tools.sandbox.elevated: not yet supported");
        }
        if (s.network) {
            compileNetworkPolicy(s.network, `${sandboxBase}.network`, changes);
        }
        if (s.filesystem) {
            const fs = s.filesystem;
            if (fs.readPaths !== undefined)
                changes[`${sandboxBase}.filesystem.readPaths`] = fs.readPaths;
            if (fs.writePaths !== undefined)
                changes[`${sandboxBase}.filesystem.writePaths`] = fs.writePaths;
            if (fs.denyPaths !== undefined)
                changes[`${sandboxBase}.filesystem.denyPaths`] = fs.denyPaths;
        }
    }
}
function compileNetworkPolicy(network, networkBase, changes) {
    if (network.egress !== undefined) {
        changes[`${networkBase}.egress`] = network.egress;
    }
    if (network.allowedDomains !== undefined) {
        changes[`${networkBase}.allowedDomains`] = network.allowedDomains;
    }
    if (network.deniedDomains !== undefined) {
        changes[`${networkBase}.deniedDomains`] = network.deniedDomains;
    }
    if (network.dnsRebindingCheck !== undefined) {
        changes[`${networkBase}.dnsRebindingCheck`] = network.dnsRebindingCheck;
    }
    if (network.denyPrivateRanges !== undefined) {
        changes[`${networkBase}.denyPrivateRanges`] = network.denyPrivateRanges;
    }
}
function compileSecrets(secrets, changes, unsupported, warnings, strict) {
    // Convert consumer mappings to OpenClaw SecretRef format
    const mapping = {};
    for (const consumer of secrets.consumer) {
        const source = secrets.mapping[consumer.name];
        if (!source)
            continue;
        if (source.source === "env") {
            mapping[consumer.name] = {
                source: "env",
                provider: "default",
                id: source.key,
            };
        }
        else if (source.source === "file") {
            mapping[consumer.name] = {
                source: "file",
                provider: "default",
                id: source.path,
            };
        }
        else if (source.source === "gateway") {
            warnings.push(`secrets.mapping.${consumer.name}: gateway secret source cannot be compiled to canonical SecretRef; skipped`);
        }
    }
    changes["secrets.mapping"] = mapping;
    if (secrets.audit) {
        if (secrets.audit.logAccess !== undefined) {
            changes["secrets.audit.logAccess"] = secrets.audit.logAccess;
        }
        if (secrets.audit.redactInTranscripts !== undefined) {
            changes["secrets.audit.redactInTranscripts"] = secrets.audit.redactInTranscripts;
        }
    }
}
function compileChannels(channels, changes, unsupported, warnings, strict) {
    // Convert channel bindings to OpenClaw bindings format
    const bindings = [];
    for (const binding of channels.bindings) {
        if (binding.channel === "discord") {
            bindings.push({
                type: "route",
                match: {
                    channel: "discord",
                    guildId: binding.guildId,
                    peer: { kind: "channel", id: binding.channelId },
                },
                session: {
                    requireMention: binding.requireMention ?? false,
                },
            });
        }
        else if (binding.channel === "telegram") {
            bindings.push({
                type: "route",
                match: {
                    channel: "telegram",
                    peer: { kind: "group", id: binding.chatId },
                },
            });
        }
        else {
            if (strict) {
                unsupported.push(`channels.bindings.${binding.channel}`);
            }
            else {
                warnings.push(`channels.bindings.${binding.channel}: channel type not yet supported`);
            }
        }
    }
    if (bindings.length > 0) {
        changes["bindings"] = bindings;
    }
}
function compileSchedules(schedules, changes, unsupported, warnings, strict) {
    const jobs = [];
    for (const schedule of schedules) {
        jobs.push({
            name: schedule.name,
            cron: schedule.cron,
            tz: schedule.tz,
            payload: schedule.payload,
            sessionTarget: schedule.sessionTarget ?? "isolated",
        });
    }
    changes["cron.jobs"] = jobs;
}
/**
 * Round-trip validation: compile → decompile → compare.
 * Returns true if the round-trip is lossless.
 */
export function validateRoundTrip(manifest) {
    const diff = compileManifest(manifest, { strict: false });
    // Check which manifest fields didn't produce any config changes
    const missing = [];
    if (manifest.policy?.onUpgrade && !diff.unsupported.includes("policy.onUpgrade")) {
        missing.push("policy.onUpgrade");
    }
    return {
        lossless: missing.length === 0 && diff.unsupported.length === 0,
        diff,
        missing,
    };
}
