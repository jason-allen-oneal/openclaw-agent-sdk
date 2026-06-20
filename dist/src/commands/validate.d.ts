import { Command } from "commander";
import type { IntegrityManifest, ValidationResult } from "../index.js";
export declare function runValidation(packagePath: string): {
    result: ValidationResult;
    integrity: IntegrityManifest | null;
};
export declare const validateCommand: Command;
//# sourceMappingURL=validate.d.ts.map