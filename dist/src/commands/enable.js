// @openclaw/agent-sdk — Enable command: validate → compile → copy files → write config.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync, } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Command } from "commander";
import { compileManifest } from "../compiler/compiler.js";
import { runValidation } from "./validate.js";
function loadManifest(packagePath) {
    const manifestPath = resolve(packagePath, "agent-package.json");
    if (!existsSync(manifestPath)) {
        throw new Error(`agent-package.json not found in ${packagePath}`);
    }
    return JSON.parse(readFileSync(manifestPath, "utf8"));
}
function isInsideRoot(root, target) {
    const rel = relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function resolvePackageFile(packagePath, src) {
    if (!src || isAbsolute(src)) {
        throw new Error(`files.copy src must be package-relative: ${src}`);
    }
    const resolved = resolve(packagePath, src);
    if (!isInsideRoot(packagePath, resolved)) {
        throw new Error(`files.copy src escapes package root: ${src}`);
    }
    if (!existsSync(resolved)) {
        throw new Error(`files.copy src not found: ${src}`);
    }
    if (!lstatSync(resolved).isFile()) {
        throw new Error(`files.copy src must be a regular file: ${src}`);
    }
    const real = realpathSync(resolved);
    if (!isInsideRoot(packagePath, real)) {
        throw new Error(`files.copy src resolves outside package root: ${src}`);
    }
    return real;
}
function resolveWorkspacePath(workspacePath, dest) {
    if (!dest || isAbsolute(dest)) {
        throw new Error(`workspace destination must be workspace-relative: ${dest}`);
    }
    const resolved = resolve(workspacePath, dest);
    if (!isInsideRoot(workspacePath, resolved)) {
        throw new Error(`workspace destination escapes workspace root: ${dest}`);
    }
    return resolved;
}
function copyFilesToWorkspace(manifest, packagePath, workspacePath) {
    const written = [];
    for (const entry of manifest.files.copy) {
        const srcPath = resolvePackageFile(packagePath, entry.src);
        const destPath = resolveWorkspacePath(workspacePath, entry.dest);
        const destDir = dirname(destPath);
        if (!existsSync(destDir))
            mkdirSync(destDir, { recursive: true });
        copyFileSync(srcPath, destPath);
        written.push(entry.dest);
    }
    return written;
}
function ensureMutableDirs(manifest, workspacePath) {
    for (const entry of manifest.files.mutable) {
        const dirPath = resolveWorkspacePath(workspacePath, entry.dest);
        if (!existsSync(dirPath))
            mkdirSync(dirPath, { recursive: true });
    }
}
function writeConfigDiff(changes, workspacePath) {
    writeFileSync(resolve(workspacePath, "agent-sdk-config.json"), JSON.stringify(changes, null, 2) + "\n", "utf8");
}
function registerPackage(manifest, workspacePath) {
    const registryPath = resolve(workspacePath, "agent-sdk-registry.json");
    let registry = {};
    if (existsSync(registryPath)) {
        try {
            registry = JSON.parse(readFileSync(registryPath, "utf8"));
        }
        catch {
            registry = {};
        }
    }
    registry[manifest.name] = {
        version: manifest.version,
        description: manifest.description,
        enabledAt: new Date().toISOString(),
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
}
function writeChannelBindings(manifest, workspacePath) {
    if (!manifest.channels?.bindings.length)
        return;
    writeFileSync(resolve(workspacePath, "agent-sdk-bindings.json"), JSON.stringify(manifest.channels.bindings, null, 2) + "\n", "utf8");
}
function writeSchedules(manifest, workspacePath) {
    if (!manifest.schedules?.length)
        return;
    writeFileSync(resolve(workspacePath, "agent-sdk-schedules.json"), JSON.stringify(manifest.schedules, null, 2) + "\n", "utf8");
}
export const enableCommand = new Command("enable")
    .description("Validate, compile, copy files, and register the agent package")
    .argument("[path]", "Package directory", ".")
    .option("--workspace <path>", "Target workspace directory", ".")
    .option("--dry-run", "Show what would be done without writing", false)
    .action(async (packagePath, options) => {
    const resolved = resolve(packagePath);
    const workspacePath = options.workspace ? resolve(options.workspace) : resolved;
    let manifest;
    try {
        manifest = loadManifest(resolved);
    }
    catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
    const { result: validationResult } = runValidation(resolved);
    if (!validationResult.valid) {
        console.error("Validation failed:");
        for (const e of validationResult.errors)
            console.error(`  - ${e.path}: ${e.message}`);
        process.exit(1);
    }
    for (const w of validationResult.warnings) {
        console.warn(`  Warning: ${w.path}: ${w.message}`);
    }
    const diff = compileManifest(manifest, { strict: false });
    for (const u of diff.unsupported) {
        console.warn(`  Warning: unsupported field: ${u}`);
    }
    for (const w of diff.warnings) {
        console.warn(`  Warning: ${w}`);
    }
    console.log(`\nPackage: ${manifest.name}@${manifest.version}`);
    console.log(`Files to copy: ${manifest.files.copy.length}`);
    console.log(`Mutable dirs: ${manifest.files.mutable.length}`);
    console.log(`Config changes: ${Object.keys(diff.changes).length}`);
    if (manifest.channels?.bindings.length)
        console.log(`Channel bindings: ${manifest.channels.bindings.length}`);
    if (manifest.schedules?.length)
        console.log(`Schedules: ${manifest.schedules.length}`);
    if (options.dryRun) {
        console.log("\n--dry-run: no changes written.");
        console.log("\nConfig diff:");
        console.log(JSON.stringify(diff.changes, null, 2));
        return;
    }
    const written = copyFilesToWorkspace(manifest, resolved, workspacePath);
    console.log(`\nCopied ${written.length} files to workspace.`);
    ensureMutableDirs(manifest, workspacePath);
    writeConfigDiff(diff.changes, workspacePath);
    console.log("Config diff written to agent-sdk-config.json");
    registerPackage(manifest, workspacePath);
    console.log("Package registered in agent-sdk-registry.json");
    writeChannelBindings(manifest, workspacePath);
    writeSchedules(manifest, workspacePath);
    console.log(`\n✓ ${manifest.name}@${manifest.version} enabled.`);
});
