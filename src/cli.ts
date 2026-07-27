#!/usr/bin/env node
// @openclaw/agent-sdk CLI — Entry point for pack, validate, enable, disable, and test.

import { Command } from "commander";
import { disableCommand } from "./commands/disable.js";
import { enableCommand } from "./commands/enable.js";
import { packCommand } from "./commands/pack.js";
import { testCommand } from "./commands/test.js";
import { validateCommand } from "./commands/validate.js";
import { PACKAGE_VERSION } from "./version.js";

const program = new Command();
program.name("openclaw-agent").description("Agent SDK packaging CLI").version(PACKAGE_VERSION);

program.addCommand(packCommand);
program.addCommand(validateCommand);
program.addCommand(enableCommand);
program.addCommand(disableCommand);
program.addCommand(testCommand);

program.parse();
