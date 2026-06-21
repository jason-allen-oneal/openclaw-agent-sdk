# Contributing

Use small, reviewable changes. This package affects agent package validation, config generation, file handling, and policy checks, so avoid broad rewrites unless the behavior proof tests move with the change.

Before opening a PR, run:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm pack
```

For changes that touch validation, paths, config merging, secrets, quarantine, or network checks, add or update tests in `src/sdk.test.ts`.

A good PR should explain:

- What behavior changed.
- What failed before the change.
- What test proves the new behavior.
- Whether package manifests or generated workspace files changed shape.
