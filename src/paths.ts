import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

export interface SafePathResult {
  path?: string;
  error?: string;
}

export function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function isDangerousPathSegment(segment: string): boolean {
  return segment === "__proto__" || segment === "prototype" || segment === "constructor";
}

export function validateRelativePath(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return `${label} is required`;
  }
  if (value.includes("\0")) {
    return `${label} contains a null byte`;
  }
  if (isAbsolute(value)) {
    return `${label} must be relative`;
  }

  const normalized = normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) {
    return `${label} escapes root`;
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.some(isDangerousPathSegment)) {
    return `${label} contains a dangerous path segment`;
  }

  return null;
}

export function resolvePackageFile(packagePath: string, src: unknown, label = "source path"): SafePathResult {
  const relativeError = validateRelativePath(src, label);
  if (relativeError) return { error: relativeError };

  const source = src as string;
  const root = resolve(packagePath);
  const resolved = resolve(root, source);
  if (!isInsideRoot(root, resolved)) return { error: `${label} escapes package root: ${source}` };
  if (!existsSync(resolved)) return { error: `${label} not found: ${source} (resolved: ${resolved})` };
  if (!lstatSync(resolved).isFile()) return { error: `${label} must be a regular file: ${source}` };

  const real = realpathSync(resolved);
  if (!isInsideRoot(root, real)) return { error: `${label} resolves outside package root: ${source}` };
  return { path: real };
}

export function resolveWorkspacePath(workspacePath: string, dest: unknown, label = "workspace path"): SafePathResult {
  const relativeError = validateRelativePath(dest, label);
  if (relativeError) return { error: relativeError };

  const destination = dest as string;
  const root = resolve(workspacePath);
  const resolved = resolve(root, destination);
  if (!isInsideRoot(root, resolved)) return { error: `${label} escapes workspace root: ${destination}` };
  return { path: resolved };
}

export function normalizeManifestPath(value: string): string {
  return normalize(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isSameOrInsidePath(parent: string, child: string): boolean {
  const normalizedParent = normalizeManifestPath(parent);
  const normalizedChild = normalizeManifestPath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}
