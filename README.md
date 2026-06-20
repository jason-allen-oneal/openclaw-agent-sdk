# OpenClaw Agent SDK

Agent package tooling for OpenClaw. This package provides TypeScript types, validation,
integrity hashing, config compilation, policy helpers, mutation detection, quarantine
support, and a CLI for packaging OpenClaw agent packages.

## What It Does

- Validates `agent-package.json` manifests.
- Generates `openclaw.integrity.json` with SHA-256 hashes for copied files and required skills.
- Compiles agent package manifests into OpenClaw config diffs.
- Enables and disables packages against a target workspace.
- Enforces fail-closed secret, tool, network, and DNS rebinding policy helpers.
- Detects drift in tracked files and writes quarantine records for mutated packages.
- Runs deterministic Agent SDK v1 behavior proofs.

## Requirements

- Node.js 22 or newer
- OpenClaw `>=2026.3.24-beta.2`

## Install

```sh
npm install @jason-allen-oneal/openclaw-agent-sdk
```

The package exposes the `openclaw-agent` CLI:

```sh
npx openclaw-agent --help
```

## CLI

Run commands from an agent package directory, or pass a package path explicitly.

```sh
openclaw-agent pack [path]
openclaw-agent validate [path]
openclaw-agent enable [path] --workspace <workspace>
openclaw-agent enable [path] --workspace <workspace> --dry-run
openclaw-agent disable [path] --workspace <workspace>
openclaw-agent disable [path] --workspace <workspace> --force
openclaw-agent test [path]
```

Command behavior:

- `pack` validates required manifest fields, hashes copied files and required skill files,
  then writes `openclaw.integrity.json`.
- `validate` checks manifest shape, file paths, integrity hashes, and mutable instruction
  file policy.
- `enable` validates, compiles config changes, copies immutable files, creates mutable
  directories, and writes workspace registration artifacts.
- `disable` removes copied files when their hashes still match the integrity manifest,
  unregisters the package, and removes generated workspace config artifacts.
- `test` runs the deterministic v1 behavior proof summary.

## Agent Package Manifest

Agent packages are described by `agent-package.json`:

```json
{
  "name": "test-agent",
  "version": "1.0.0",
  "description": "A test agent package.",
  "files": {
    "copy": [
      { "src": "files/AGENTS.md", "dest": "AGENTS.md" },
      { "src": "files/SOUL.md", "dest": "SOUL.md" }
    ],
    "mutable": [
      { "dest": "memory/", "description": "Agent working memory." }
    ]
  },
  "skills": [
    { "path": "skills/my-skill", "required": true }
  ],
  "secrets": {
    "consumer": [
      { "name": "API_KEY", "required": true, "description": "Service API key." }
    ],
    "mapping": {
      "API_KEY": { "source": "env", "key": "API_KEY" }
    },
    "audit": {
      "logAccess": true,
      "redactInTranscripts": true
    }
  },
  "tools": {
    "allow": ["read", "write"],
    "deny": ["exec"],
    "sandbox": {
      "network": {
        "egress": "restricted",
        "allowedDomains": ["api.example.com"],
        "dnsRebindingCheck": true,
        "denyPrivateRanges": true
      }
    }
  },
  "policy": {
    "denyMutableInstructionFiles": true,
    "allowMutableUserInstructionFiles": false,
    "onUpgrade": "preserve-custom"
  }
}
```

Important path rules:

- `files.copy[].src` must be package-relative and stay inside the package root.
- `files.copy[].dest` and `files.mutable[].dest` must be workspace-relative.
- Mutable paths cannot overlap copied files.
- Mutable instruction files are denied by default for `AGENTS.md`, `SOUL.md`,
  `USER.md`, and `HEARTBEAT.md`.

## Library Usage

```ts
import {
  checkDnsRebinding,
  checkNetworkEgress,
  compileManifest,
  isToolAllowed,
  resolveSecret,
} from "@jason-allen-oneal/openclaw-agent-sdk";

const diff = compileManifest(manifest, { strict: false });
const secret = resolveSecret({ source: "env", key: "API_KEY" });
const network = checkNetworkEgress("api.example.com", {
  egress: "restricted",
  allowedDomains: ["api.example.com"],
});
```

The package also exports manifest, integrity, validation, policy, compiler, and quarantine
types for TypeScript consumers.

## Development

```sh
npm install
npm run typecheck
npm run build
```

`npm run build` emits the package files under `dist/`.

## License

MIT
