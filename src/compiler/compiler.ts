// @openclaw/agent-sdk — Config compiler: manifest to OpenClaw config diff (dry-run, no writes).

import type {
  AgentPackageManifest,
  NetworkPolicy,
  ToolsDeclaration,
  ChannelsDeclaration,
  ScheduleDeclaration,
  SecretsDeclaration,
} from "../index.js";

export interface ConfigDiff {
  /** Dot-path to new value for each changed field. */
  changes: Record<string, unknown>;
  /** Dot-paths that would be removed. */
  removals: string[];
  /** Fields in the manifest that do not map to any known config path. */
  unsupported: string[];
  /** Warnings (non-fatal). */
  warnings: string[];
}

export interface CompilerOptions {
  /** If true, reject unsupported fields. Default: true. */
  strict?: boolean;
}

const KNOWN_STATIC_PATHS = new Set([
  "agents.defaults.maxTokensPerTurn",
  "agents.defaults.allowedModels",
  "agents.defaults.tools.allow",
  "agents.defaults.tools.deny",
  "agents.defaults.sandbox.mode",
  "agents.defaults.sandbox.elevated",
  "agents.defaults.sandbox.network.egress",
  "agents.defaults.sandbox.network.allowedDomains",
  "agents.defaults.sandbox.network.deniedDomains",
  "agents.defaults.sandbox.network.dnsRebindingCheck",
  "agents.defaults.sandbox.network.denyPrivateRanges",
  "agents.defaults.sandbox.filesystem.readPaths",
  "agents.defaults.sandbox.filesystem.writePaths",
  "agents.defaults.sandbox.filesystem.denyPaths",
  "secrets.mapping",
  "secrets.audit.logAccess",
  "secrets.audit.redactInTranscripts",
  "bindings",
  "cron.jobs",
  "agentPackages.enabled",
  "agentPackages.policy.denyMutableInstructionFiles",
  "agentPackages.policy.allowMutableUserInstructionFiles",
  "agentPackages.policy.onUpgrade",
  "agentPackages.registry",
  "agentPackages.upgradedAt",
  "agentPackages.previousVersion",
]);

function isKnownConfigPath(path: string): boolean {
  return KNOWN_STATIC_PATHS.has(path) || path.startsWith("agentPackages.packages.");
}

function assertKnownOutputPaths(diff: ConfigDiff): void {
  for (const path of Object.keys(diff.changes)) {
    if (!isKnownConfigPath(path) && !diff.unsupported.includes(path)) {
      diff.unsupported.push(path);
    }
  }
}

/**
 * Compile an agent-package manifest into a config diff.
 * No writes. Pure computation.
 */
export function compileManifest(
  manifest: AgentPackageManifest,
  options: CompilerOptions = {},
): ConfigDiff {
  const strict = options.strict ?? true;
  const changes: Record<string, unknown> = {};
  const removals: string[] = [];
  const unsupported: string[] = [];
  const warnings: string[] = [];
  const packageBase = `agentPackages.packages.${manifest.name}`;
  const policyScope = manifest.policy?.scope ?? "package";
  const scopedPolicyPath = (field: string) =>
    policyScope === "global" ? `agents.defaults.${field}` : `${packageBase}.policy.${field}`;
  const scopedMutablePolicyPath = (field: string) =>
    policyScope === "global" ? `agentPackages.policy.${field}` : `${packageBase}.policy.${field}`;
  const scopedToolsBase = policyScope === "global" ? "agents.defaults.tools" : `${packageBase}.tools`;
  const scopedSandboxBase =
    policyScope === "global" ? "agents.defaults.sandbox" : `${packageBase}.sandbox`;

  if (manifest.policy) {
    const p = manifest.policy;
    if (p.maxTokensPerTurn !== undefined) {
      changes[scopedPolicyPath("maxTokensPerTurn")] = p.maxTokensPerTurn;
    }
    if (p.allowedModels !== undefined) {
      changes[scopedPolicyPath("allowedModels")] = p.allowedModels;
    }
    if (p.denyMutableInstructionFiles !== undefined) {
      changes[scopedMutablePolicyPath("denyMutableInstructionFiles")] = p.denyMutableInstructionFiles;
    }
    if (p.allowMutableUserInstructionFiles !== undefined) {
      changes[scopedMutablePolicyPath("allowMutableUserInstructionFiles")] = p.allowMutableUserInstructionFiles;
    }
    if (p.onUpgrade !== undefined) {
      changes[scopedMutablePolicyPath("onUpgrade")] = p.onUpgrade;
    }
    if (p.scope !== undefined && p.scope !== "package" && p.scope !== "global") {
      if (strict) unsupported.push("policy.scope");
      else warnings.push("policy.scope: must be package or global");
    }
  }

  if (manifest.tools) {
    compileTools(manifest.tools, scopedToolsBase, scopedSandboxBase, changes);
  }

  if (manifest.secrets) {
    compileSecrets(manifest.secrets, changes, warnings);
  }

  if (manifest.channels) {
    compileChannels(manifest.channels, changes, unsupported, warnings, strict);
  }

  if (manifest.schedules) {
    compileSchedules(manifest.schedules, changes);
  }

  changes["agentPackages.enabled"] = [manifest.name];
  changes["agentPackages.registry"] = {
    [manifest.name]: {
      version: manifest.version,
      description: manifest.description,
    },
  };

  const diff = { changes, removals, unsupported, warnings };
  assertKnownOutputPaths(diff);
  return diff;
}

function compileTools(
  tools: ToolsDeclaration,
  toolsBase: string,
  sandboxBase: string,
  changes: Record<string, unknown>,
): void {
  if (tools.allow !== undefined) {
    changes[`${toolsBase}.allow`] = tools.allow;
  }
  if (tools.deny !== undefined) {
    changes[`${toolsBase}.deny`] = tools.deny;
  }
  if (tools.sandbox) {
    const s = tools.sandbox;
    if (s.mode !== undefined) changes[`${sandboxBase}.mode`] = s.mode;
    if (s.elevated !== undefined) changes[`${sandboxBase}.elevated`] = s.elevated;
    if (s.network) compileNetworkPolicy(s.network, `${sandboxBase}.network`, changes);
    if (s.filesystem) {
      const fs = s.filesystem;
      if (fs.readPaths !== undefined) changes[`${sandboxBase}.filesystem.readPaths`] = fs.readPaths;
      if (fs.writePaths !== undefined) changes[`${sandboxBase}.filesystem.writePaths`] = fs.writePaths;
      if (fs.denyPaths !== undefined) changes[`${sandboxBase}.filesystem.denyPaths`] = fs.denyPaths;
    }
  }
}

function compileNetworkPolicy(
  network: NetworkPolicy,
  networkBase: string,
  changes: Record<string, unknown>,
): void {
  if (network.egress !== undefined) changes[`${networkBase}.egress`] = network.egress;
  if (network.allowedDomains !== undefined) changes[`${networkBase}.allowedDomains`] = network.allowedDomains;
  if (network.deniedDomains !== undefined) changes[`${networkBase}.deniedDomains`] = network.deniedDomains;
  if (network.dnsRebindingCheck !== undefined) changes[`${networkBase}.dnsRebindingCheck`] = network.dnsRebindingCheck;
  if (network.denyPrivateRanges !== undefined) changes[`${networkBase}.denyPrivateRanges`] = network.denyPrivateRanges;
}

function compileSecrets(
  secrets: SecretsDeclaration,
  changes: Record<string, unknown>,
  warnings: string[],
): void {
  const mapping: Record<string, unknown> = {};
  for (const consumer of secrets.consumer) {
    const source = secrets.mapping[consumer.name];
    if (!source) continue;

    if (source.source === "env") {
      mapping[consumer.name] = {
        source: "env",
        provider: "default",
        id: source.key,
      };
    } else if (source.source === "file") {
      mapping[consumer.name] = {
        source: "file",
        provider: "default",
        id: source.path,
      };
    } else if (source.source === "gateway") {
      warnings.push(
        `secrets.mapping.${consumer.name}: gateway secret source cannot be compiled to canonical SecretRef; skipped`,
      );
    }
  }
  changes["secrets.mapping"] = mapping;

  if (secrets.audit) {
    if (secrets.audit.logAccess !== undefined) changes["secrets.audit.logAccess"] = secrets.audit.logAccess;
    if (secrets.audit.redactInTranscripts !== undefined) {
      changes["secrets.audit.redactInTranscripts"] = secrets.audit.redactInTranscripts;
    }
  }
}

function compileChannels(
  channels: ChannelsDeclaration,
  changes: Record<string, unknown>,
  unsupported: string[],
  warnings: string[],
  strict: boolean,
): void {
  const bindings: unknown[] = [];
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
    } else if (binding.channel === "telegram") {
      bindings.push({
        type: "route",
        match: {
          channel: "telegram",
          peer: { kind: "group", id: binding.chatId },
        },
      });
    } else {
      if (strict) unsupported.push(`channels.bindings.${binding.channel}`);
      else warnings.push(`channels.bindings.${binding.channel}: channel type not yet supported`);
    }
  }
  if (bindings.length > 0) {
    changes["bindings"] = bindings;
  }
}

function compileSchedules(
  schedules: ScheduleDeclaration[],
  changes: Record<string, unknown>,
): void {
  const jobs: unknown[] = [];
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
 * Compile coverage validation.
 */
export function validateCompileCoverage(manifest: AgentPackageManifest): {
  lossless: boolean;
  diff: ConfigDiff;
  missing: string[];
} {
  const diff = compileManifest(manifest, { strict: false });
  return {
    lossless: diff.unsupported.length === 0,
    diff,
    missing: diff.unsupported,
  };
}

export const validateRoundTrip = validateCompileCoverage;
