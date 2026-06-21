# OpenClaw Agent SDK

Agent SDK Packaging is a thin, security-focused packaging layer for OpenClaw agents. It gives an agent package a reviewable manifest, deterministic file hashing, validation, config compilation, policy enforcement helpers, mutation detection, quarantine support, and CLI tooling.

The core idea is simple: an agent package should be installable, inspectable, testable, auditable, and removable without relying on hidden setup steps or unchecked runtime behavior.

## Status

This repository is an early Agent SDK packaging implementation for OpenClaw. It is not a replacement for OpenClaw's plugin runtime. It sits above the runtime and describes how an agent package should be validated, copied into a workspace, mapped into config, and constrained by policy.

The current package name is:

```text
@jason-allen-oneal/openclaw-agent-sdk
```

The current CLI binary is:

```text
openclaw-agent
```

## What it does

Agent SDK Packaging provides:

- `agent-package.json` manifest types for agent packages.
- `openclaw.integrity.json` generation for tamper evidence.
- Manifest validation for required fields, package-local source paths, workspace-relative destination paths, secrets, tools, schedules, and mutable instruction file policy.
- A config compiler that converts package intent into OpenClaw config diff paths.
- CLI commands for packing, validating, enabling, disabling, and testing packages.
- Deterministic behavior proof checks for the Agent SDK v1 security model.
- Helpers for secrets, network egress policy, DNS rebinding checks, mutation detection, and quarantine.

## Install and build

Requirements:

- Node.js 22 or newer.
- pnpm.
- OpenClaw `>=2026.3.24-beta.2` as a peer dependency.

Install dependencies and build:

```bash
pnpm install
pnpm build
```

Typecheck without writing build output:

```bash
pnpm typecheck
```

Before publishing or packing the npm package, the `prepack` script runs the TypeScript build:

```bash
pnpm pack
```

## CLI usage

After the package is installed or linked, use:

```bash
openclaw-agent <command> [path]
```

Available commands:

```bash
openclaw-agent pack [path]
openclaw-agent validate [path]
openclaw-agent enable [path] --workspace <path> [--dry-run]
openclaw-agent disable [path] --workspace <path> [--force]
openclaw-agent test [path]
```

### pack

Validates the package manifest, hashes immutable package files, hashes required skill files, and writes:

```text
openclaw.integrity.json
```

Example:

```bash
openclaw-agent pack ./examples/my-agent
```

The integrity manifest records package name, package version, hashing algorithm, tracked copied files, tracked skill files, and generation time.

### validate

Validates the package manifest, file paths, integrity manifest when present, and mutable instruction file policy.

Example:

```bash
openclaw-agent validate ./examples/my-agent
```

Validation fails closed for malformed manifests, missing required fields, missing copied files, absolute paths, workspace escape attempts, integrity mismatches, and denied mutable instruction file layouts.

### enable

Validates the package, compiles config changes, copies immutable package files into a target workspace, creates mutable directories, writes package registry state, and writes generated config artifacts.

Dry run first:

```bash
openclaw-agent enable ./examples/my-agent --workspace ./workspace --dry-run
```

Apply changes:

```bash
openclaw-agent enable ./examples/my-agent --workspace ./workspace
```

Generated workspace files can include:

```text
agent-sdk-config.json
agent-sdk-registry.json
agent-sdk-bindings.json
agent-sdk-schedules.json
```

### disable

Removes copied files, unregisters the package, and cleans generated workspace artifacts. Copied files are only removed safely when they still match the integrity manifest. Modified files are skipped unless `--force` is used.

Example:

```bash
openclaw-agent disable ./examples/my-agent --workspace ./workspace
```

Force removal of modified copied files:

```bash
openclaw-agent disable ./examples/my-agent --workspace ./workspace --force
```

### test

Runs the deterministic Agent SDK v1 behavior proof summary for a package.

Example:

```bash
openclaw-agent test ./examples/my-agent
```

The proof suite checks the package against required behavior IDs such as manifest validity, integrity mismatch rejection, quarantine on drift, denied mutable instruction files, required tool and secret fail-closed behavior, external-content-to-exec blocking, private network blocking, DNS rebinding blocking, sandbox policy, config compiler dry run behavior, and upgrade policy behavior.

## Package layout

A minimal package looks like this:

```text
my-agent/
  agent-package.json
  AGENTS.md
  skills/
    planner/
      SKILL.md
```

The package root must contain `agent-package.json`.

Source paths in `files.copy` must be package-relative. Absolute source paths are rejected. Source paths that escape the package root are rejected.

Destination paths in `files.copy` and `files.mutable` must be workspace-relative. Absolute destination paths are rejected. Destination paths that escape the workspace root are rejected.

## Manifest example

```json
{
  "name": "example-agent",
  "version": "1.0.0",
  "description": "Example OpenClaw agent package.",
  "license": "MIT",
  "metadata": {
    "author": "Example Author",
    "homepage": "https://example.com",
    "repository": "https://github.com/example/example-agent",
    "tags": ["openclaw", "agent"]
  },
  "files": {
    "copy": [
      {
        "src": "AGENTS.md",
        "dest": "AGENTS.md"
      }
    ],
    "mutable": [
      {
        "dest": "memory",
        "description": "Package-owned mutable memory directory."
      }
    ]
  },
  "skills": [
    {
      "path": "skills/planner",
      "required": true
    }
  ],
  "secrets": {
    "consumer": [
      {
        "name": "EXAMPLE_API_KEY",
        "required": true,
        "description": "API key used by the example agent."
      }
    ],
    "mapping": {
      "EXAMPLE_API_KEY": {
        "source": "env",
        "key": "EXAMPLE_API_KEY"
      }
    },
    "audit": {
      "logAccess": true,
      "redactInTranscripts": true
    }
  },
  "tools": {
    "allow": ["read", "search"],
    "deny": ["exec"],
    "sandbox": {
      "mode": "require",
      "network": {
        "egress": "restricted",
        "allowedDomains": ["api.example.com"],
        "dnsRebindingCheck": true,
        "denyPrivateRanges": true
      },
      "filesystem": {
        "readPaths": ["."],
        "writePaths": ["memory"],
        "denyPaths": [".git", "node_modules"]
      }
    }
  },
  "schedules": [
    {
      "name": "daily-check",
      "cron": "0 8 * * *",
      "tz": "America/New_York",
      "payload": {
        "kind": "agentTurn",
        "message": "Run the daily check."
      },
      "sessionTarget": "isolated"
    }
  ],
  "policy": {
    "scope": "package",
    "denyMutableInstructionFiles": true,
    "allowMutableUserInstructionFiles": false,
    "onUpgrade": "prompt",
    "maxTokensPerTurn": 8000,
    "allowedModels": ["gpt-5.5-thinking"]
  }
}
```

## Manifest fields

### name, version, description

These fields are required. They identify the package and are also copied into generated registry state.

### files.copy

Immutable files that should be copied from the package into the workspace. Each entry has:

- `src`: package-relative source file.
- `dest`: workspace-relative destination file.

Copied files are tracked by the integrity manifest.

### files.mutable

Workspace-relative directories that the package is allowed to create or use as mutable state.

By default, mutable paths must not include protected instruction files such as:

```text
AGENTS.md
SOUL.md
USER.md
HEARTBEAT.md
```

This default is controlled by `policy.denyMutableInstructionFiles`. `USER.md` can be allowed explicitly with `policy.allowMutableUserInstructionFiles`.

### skills

Optional skill declarations. A required skill is expected to contain:

```text
<skill path>/SKILL.md
```

Required skill files are hashed during `pack` and checked during behavior proofs.

### secrets

Secrets are declared as consumers and mapped to a source. Supported sources are:

- `env`
- `gateway`
- `file`

Missing required secret mappings fail validation. Missing runtime secret resolution fails closed.

### tools

Tool policy supports allow and deny lists. The deny list takes priority when checking whether a tool is allowed.

Sandbox policy can describe network and filesystem constraints. Network policy supports restricted egress, allowed domains, denied domains, DNS rebinding checks, and private IP range blocking.

### channels

Channel bindings can describe routes for external channels. Current type support includes Discord and Telegram in the config compiler. Other channel types are treated as unsupported by the compiler.

### schedules

Schedules define cron jobs with payloads. Payloads can be agent turns or system events. Schedules default to isolated sessions unless another session target is provided.

### policy

Package policy controls mutable instruction files, upgrade behavior, scoped policy application, max tokens per turn, and allowed models.

`policy.scope` can be:

- `package`
- `global`

Package-scoped policy applies under the package config path. Global policy writes to default OpenClaw config paths.

## Security model

This SDK is built around conservative package behavior:

- File installation uses explicit manifest entries.
- Package source files must stay inside the package root.
- Workspace destinations must stay inside the workspace root.
- Immutable copied files are hashed.
- Integrity mismatch is treated as a failure.
- Mutable instruction files are denied by default.
- Tool policy uses explicit allow and deny lists.
- Secrets are declared and scoped.
- Restricted network policy can block unlisted egress, private ranges, and DNS rebinding attempts.
- Drift can trigger quarantine state.
- Disable skips modified copied files unless forced.

The intended default is fail closed. If the package cannot prove that a behavior is safe, validation or proof checks should fail instead of silently accepting it.

## Programmatic API

The package exports TypeScript types and helpers for package validation, config compilation, policies, mutation checks, and quarantine handling.

Examples of exported helpers include:

```ts
import {
  compileManifest,
  validateRoundTrip,
  resolveSecret,
  isToolAllowed,
  checkNetworkEgress,
  checkDnsRebinding,
  checkMutation,
  quarantinePackage
} from "@jason-allen-oneal/openclaw-agent-sdk";
```

Common exported type groups include:

- `AgentPackageManifest`
- `FilesDeclaration`
- `SkillDeclaration`
- `SecretsDeclaration`
- `ToolsDeclaration`
- `PolicyDeclaration`
- `IntegrityManifest`
- `ValidationResult`
- `ConfigDiff`
- `MutationCheckResult`
- `QuarantineRecord`

## Recommended workflow

For package authors:

```bash
openclaw-agent pack ./my-agent
openclaw-agent validate ./my-agent
openclaw-agent test ./my-agent
openclaw-agent enable ./my-agent --workspace ./workspace --dry-run
openclaw-agent enable ./my-agent --workspace ./workspace
```

For reviewers:

```bash
openclaw-agent validate ./my-agent
openclaw-agent test ./my-agent
```

Then inspect:

```text
agent-package.json
openclaw.integrity.json
agent-sdk-config.json
agent-sdk-registry.json
```

Do not approve a package just because it builds. Review the manifest permissions, copied files, mutable paths, network policy, secret mappings, and generated config diff.

## Repository development

Build:

```bash
pnpm build
```

Typecheck:

```bash
pnpm typecheck
```

Package:

```bash
pnpm pack
```

## License

MIT
