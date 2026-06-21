import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileManifest } from "./compiler/compiler.js";
import { applyConfigDiff } from "./compiler/live.js";
import { runValidation } from "./commands/validate.js";
import { hashFile } from "./hash.js";
import type { AgentPackageManifest, IntegrityManifest } from "./index.js";
import { checkDnsRebinding, checkNetworkEgress } from "./policy/network.js";
import { resolveSecret } from "./policy/secrets.js";
import { isQuarantined, liftQuarantine, quarantinePackage } from "./quarantine/mutation.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makePackage(): { dir: string; manifest: AgentPackageManifest } {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-agent-sdk-"));
  mkdirSync(join(dir, "skills", "planner"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), "You are a test agent.\n", "utf8");
  writeFileSync(join(dir, "skills", "planner", "SKILL.md"), "# Planner\n", "utf8");

  const manifest: AgentPackageManifest = {
    name: "test-agent",
    version: "1.0.0",
    description: "Test agent package.",
    files: {
      copy: [{ src: "AGENTS.md", dest: "AGENTS.md" }],
      mutable: [{ dest: "memory", description: "Mutable memory" }],
    },
    skills: [{ path: "skills/planner", required: true }],
    secrets: {
      consumer: [{ name: "API_KEY", required: true }],
      mapping: { API_KEY: { source: "env", key: "API_KEY" } },
    },
    tools: {
      allow: ["read", "search"],
      deny: ["exec"],
      sandbox: {
        mode: "require",
        network: {
          egress: "restricted",
          allowedDomains: ["api.example.com"],
          dnsRebindingCheck: true,
          denyPrivateRanges: true,
        },
      },
    },
    schedules: [
      {
        name: "daily",
        cron: "0 8 * * *",
        payload: { kind: "agentTurn", message: "Run daily check." },
      },
    ],
    policy: {
      scope: "package",
      denyMutableInstructionFiles: true,
      onUpgrade: "prompt",
      maxTokensPerTurn: 1000,
    },
  };

  writeJson(join(dir, "agent-package.json"), manifest);
  const integrity: IntegrityManifest = {
    version: 1,
    algorithm: "sha256",
    package: { name: manifest.name, version: manifest.version },
    files: { "AGENTS.md": hashFile(join(dir, "AGENTS.md")) },
    skills: { "skills/planner/SKILL.md": hashFile(join(dir, "skills", "planner", "SKILL.md")) },
    generatedAt: new Date().toISOString(),
  };
  writeJson(join(dir, "openclaw.integrity.json"), integrity);

  return { dir, manifest };
}

describe("Agent SDK hardening", () => {
  it("validates a well-formed package", () => {
    const { dir } = makePackage();
    const { result } = runValidation(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects escaping file secret paths", () => {
    const { dir, manifest } = makePackage();
    manifest.secrets = {
      consumer: [{ name: "FILE_SECRET", required: true }],
      mapping: { FILE_SECRET: { source: "file", path: "../secret.txt" } },
    };
    writeJson(join(dir, "agent-package.json"), manifest);

    const { result } = runValidation(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.includes("escapes root"))).toBe(true);

    const secret = resolveSecret({ source: "file", path: "../secret.txt" }, dir);
    expect(secret.value).toBeUndefined();
    expect(secret.error).toBeDefined();
  });

  it("detects quarantine state and clears it when lifted", () => {
    const { dir, manifest } = makePackage();
    const integrity = JSON.parse(readFileSync(join(dir, "openclaw.integrity.json"), "utf8")) as IntegrityManifest;
    const workspace = mkdtempSync(join(tmpdir(), "openclaw-agent-workspace-"));
    writeFileSync(join(workspace, "AGENTS.md"), "mutated\n", "utf8");

    quarantinePackage(manifest.name, integrity, workspace);
    expect(isQuarantined(workspace)).toBe(true);
    expect(liftQuarantine(workspace)).toBe(true);
    expect(isQuarantined(workspace)).toBe(false);
  });

  it("accumulates enabled package config entries", () => {
    const workspace = mkdtempSync(join(tmpdir(), "openclaw-agent-config-"));
    const one = compileManifest({ ...makePackage().manifest, name: "one" }, { strict: false });
    const two = compileManifest({ ...makePackage().manifest, name: "two" }, { strict: false });

    expect(applyConfigDiff(one, workspace).success).toBe(true);
    expect(applyConfigDiff(two, workspace).success).toBe(true);

    const config = JSON.parse(readFileSync(resolve(workspace, "agent-sdk-config.json"), "utf8")) as {
      agentPackages: { enabled: string[] };
    };
    expect(config.agentPackages.enabled).toEqual(["one", "two"]);
  });

  it("compiles supported sandbox and upgrade policy fields", () => {
    const { manifest } = makePackage();
    const diff = compileManifest(manifest, { strict: false });
    expect(diff.unsupported).toEqual([]);
    expect(diff.changes[`agentPackages.packages.${manifest.name}.sandbox.mode`]).toBe("require");
    expect(diff.changes[`agentPackages.packages.${manifest.name}.policy.onUpgrade`]).toBe("prompt");
  });

  it("enforces network allowlists and denied resolved IP ranges", () => {
    const policy = {
      egress: "restricted" as const,
      allowedDomains: ["api.example.com"],
      dnsRebindingCheck: true,
      denyPrivateRanges: true,
    };

    expect(checkNetworkEgress("API.EXAMPLE.COM.", policy).allowed).toBe(true);
    expect(checkNetworkEgress("evil.example.com", policy).allowed).toBe(false);
    expect(checkDnsRebinding("api.example.com", "127.0.0.1", policy).allowed).toBe(false);
  });
});
