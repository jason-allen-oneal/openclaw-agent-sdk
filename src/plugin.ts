import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";

export * from "./index.js";
export { resolveSecret, isToolAllowed } from "./policy/secrets.js";
export { checkNetworkEgress, isPrivateIp, checkDnsRebinding } from "./policy/network.js";
export { compileManifest, validateRoundTrip } from "./compiler/compiler.js";
export {
  checkMutation,
  quarantinePackage,
  isQuarantined,
  getQuarantineRecord,
  liftQuarantine,
  isToolAllowedInQuarantine,
} from "./quarantine/mutation.js";
export { hashFile, hashString } from "./hash.js";

const entry: OpenClawPluginDefinition = {
  id: "agent-sdk",
  name: "Agent SDK Packaging",
  description:
    "Agent SDK Packaging plugin — package validation, integrity hashing, config compilation, policy enforcement, mutation detection, and CLI tooling.",
  register(api) {
    api.registerCli(
      async ({ program }) => {
        const { packCommand } = await import("./commands/pack.js");
        const { validateCommand } = await import("./commands/validate.js");
        const { enableCommand } = await import("./commands/enable.js");
        const { disableCommand } = await import("./commands/disable.js");
        const { testCommand } = await import("./commands/test.js");

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

    api.registerTrustedToolPolicy({
      id: "agent-sdk-policy",
      description: "Evaluates agent package policy before tool execution.",
      evaluate: (event) => {
        const pluginConfig = (api.pluginConfig ?? {}) as {
          denyMutableInstructionFiles?: boolean;
          allowMutableUserInstructionFiles?: boolean;
        };

        if (pluginConfig.denyMutableInstructionFiles !== false && event.toolName === "write") {
          const params = event.params as { file_path?: string };
          if (params.file_path) {
            const baseName = params.file_path.split(/[\\/]/).pop() ?? "";
            const protectedInstructionFiles = ["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md"];
            if (
              protectedInstructionFiles.includes(baseName) &&
              !(baseName === "USER.md" && pluginConfig.allowMutableUserInstructionFiles === true)
            ) {
              return {
                block: true,
                blockReason: `Instruction file ${baseName} is protected by agent-sdk policy`,
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
