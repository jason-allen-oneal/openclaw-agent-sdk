// @ts-nocheck
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";

// Re-export all types from the SDK for external consumers
export * from "./src/index.js";

// Re-export key functions for direct use
export { resolveSecret, isToolAllowed } from "./src/policy/secrets.js";
export { checkNetworkEgress, isPrivateIp, checkDnsRebinding } from "./src/policy/network.js";
export { compileManifest, validateRoundTrip } from "./src/compiler/compiler.js";
export { checkMutation, quarantinePackage, isQuarantined, getQuarantineRecord, liftQuarantine, isToolAllowedInQuarantine } from "./src/quarantine/mutation.js";
export { hashFile, hashString } from "./src/hash.js";

const entry: OpenClawPluginDefinition = {
  id: "agent-sdk",
  name: "Agent SDK Packaging",
  description: "Agent SDK Packaging plugin — package validation, integrity hashing, config compilation, policy enforcement, mutation detection, and CLI tooling.",
  register(api) {
    // ── CLI commands ──────────────────────────────────────────────────
    api.registerCli(
      async ({ program }) => {
        const { packCommand } = await import("./src/commands/pack.js");
        const { validateCommand } = await import("./src/commands/validate.js");
        const { enableCommand } = await import("./src/commands/enable.js");
        const { disableCommand } = await import("./src/commands/disable.js");
        const { testCommand } = await import("./src/commands/test.js");

        program.addCommand(packCommand);
        program.addCommand(validateCommand);
        program.addCommand(enableCommand);
        program.addCommand(disableCommand);
        program.addCommand(testCommand);
      },
      {
        descriptors: [
          {
            name: "agent-sdk",
            description: "Agent SDK packaging commands (pack, validate, enable, disable, test)",
            hasSubcommands: true,
          },
          {
            name: "agent",
            description: "Agent SDK packaging (alias for agent-sdk)",
            hasSubcommands: true,
          },
        ],
      },
    );

    // ── Trusted tool policy ────────────────────────────────────────────
    api.registerTrustedToolPolicy({
      id: "agent-sdk-policy",
      description: "Evaluates agent package policy (secrets, network, tools, sandbox) before tool execution.",
      evaluate: (event) => {
        const pluginConfig = (api.pluginConfig ?? {}) as {
          denyMutableInstructionFiles?: boolean;
          allowMutableUserInstructionFiles?: boolean;
        };

        // Deny mutable instruction files by default
        if (pluginConfig.denyMutableInstructionFiles && event.toolName === "write") {
          const params = event.params as { file_path?: string };
          if (params.file_path) {
            const INSTRUCTION_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md"];
            const baseName = params.file_path.split("/").pop() ?? "";
            if (INSTRUCTION_FILES.includes(baseName) && !pluginConfig.allowMutableUserInstructionFiles) {
              return {
                block: true,
                blockReason: `Instruction file ${baseName} is protected by agent-sdk policy (denyMutableInstructionFiles)`,
              };
            }
          }
        }

        return;
      },
    });
  },
};

export default entry;
