// @openclaw/agent-sdk — Pack command: validate manifest, hash files, generate integrity manifest.
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { Command } from "commander";
import { hashFile } from "../hash.js";
function loadManifest(packagePath) {
    const manifestPath = resolve(packagePath, "agent-package.json");
    if (!existsSync(manifestPath)) {
        throw new Error(`agent-package.json not found in ${packagePath}`);
    }
    const raw = readFileSync(manifestPath, "utf8");
    return JSON.parse(raw);
}
function validateRequiredFields(manifest) {
    const errors = [];
    if (!manifest.name)
        errors.push("name is required");
    if (!manifest.version)
        errors.push("version is required");
    if (!manifest.description)
        errors.push("description is required");
    if (!manifest.files) {
        errors.push("files is required");
    }
    else {
        if (!manifest.files.copy)
            errors.push("files.copy is required");
        if (!manifest.files.mutable)
            errors.push("files.mutable is required");
    }
    return errors;
}
function isInsideRoot(root, target) {
    const rel = relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function resolvePackageFile(packagePath, src) {
    if (!src || isAbsolute(src))
        return { error: `absolute source paths are not allowed: ${src}` };
    const resolved = resolve(packagePath, src);
    if (!isInsideRoot(packagePath, resolved))
        return { error: `source escapes package root: ${src}` };
    if (!existsSync(resolved))
        return { error: `src not found: ${src} (resolved: ${resolved})` };
    if (!lstatSync(resolved).isFile())
        return { error: `source must be a regular file: ${src}` };
    const real = realpathSync(resolved);
    if (!isInsideRoot(packagePath, real)) {
        return { error: `source resolves outside package root: ${src}` };
    }
    return { path: real };
}
function validateWorkspaceRelativeDest(dest) {
    if (!dest || isAbsolute(dest))
        return `absolute destination paths are not allowed: ${dest}`;
    const normalized = relative(".", dest);
    if (normalized.startsWith("..") || isAbsolute(normalized)) {
        return `destination escapes workspace root: ${dest}`;
    }
    return null;
}
function validateCopyEntries(manifest, packagePath) {
    const resolved = new Map();
    const errors = [];
    for (const entry of manifest.files.copy) {
        const source = resolvePackageFile(packagePath, entry.src);
        if (source.error || !source.path) {
            errors.push(`files.copy: ${source.error}`);
            continue;
        }
        const destError = validateWorkspaceRelativeDest(entry.dest);
        if (destError) {
            errors.push(`files.copy: ${destError}`);
            continue;
        }
        const hash = hashFile(source.path);
        resolved.set(entry.dest, hash);
    }
    return { resolved, errors };
}
function hashSkillFiles(skills, packagePath) {
    const resolved = new Map();
    const errors = [];
    if (!skills)
        return { resolved, errors };
    for (const skill of skills) {
        const skillSource = `${skill.path}/SKILL.md`;
        const skillMd = resolvePackageFile(packagePath, skillSource);
        if (skillMd.error || !skillMd.path) {
            if (skill.required !== false) {
                errors.push(`skills: required SKILL.md invalid: ${skillSource}: ${skillMd.error}`);
            }
            continue;
        }
        const relPath = skillSource;
        const hash = hashFile(skillMd.path);
        resolved.set(relPath, hash);
    }
    return { resolved, errors };
}
export const packCommand = new Command("pack")
    .description("Validate manifest, hash files, generate openclaw.integrity.json")
    .argument("[path]", "Package directory", ".")
    .action(async (packagePath) => {
    const resolved = resolve(packagePath);
    let manifest;
    try {
        manifest = loadManifest(resolved);
    }
    catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
    const fieldErrors = validateRequiredFields(manifest);
    if (fieldErrors.length > 0) {
        console.error("Validation failed:");
        for (const e of fieldErrors)
            console.error(`  - ${e}`);
        process.exit(1);
    }
    const { resolved: fileHashes, errors: fileErrors } = validateCopyEntries(manifest, resolved);
    const { resolved: skillHashes, errors: skillErrors } = hashSkillFiles(manifest.skills, resolved);
    const allErrors = [...fileErrors, ...skillErrors];
    if (allErrors.length > 0) {
        console.error("Pack failed:");
        for (const e of allErrors)
            console.error(`  - ${e}`);
        process.exit(1);
    }
    const integrity = {
        version: 1,
        algorithm: "sha256",
        package: {
            name: manifest.name,
            version: manifest.version,
        },
        files: Object.fromEntries(fileHashes),
        skills: Object.fromEntries(skillHashes),
        generatedAt: new Date().toISOString(),
    };
    const outputPath = resolve(resolved, "openclaw.integrity.json");
    writeFileSync(outputPath, JSON.stringify(integrity, null, 2) + "\n", "utf8");
    console.log(`Integrity manifest written to ${outputPath}`);
    console.log(`  Files tracked: ${fileHashes.size}`);
    console.log(`  Skills tracked: ${skillHashes.size}`);
});
