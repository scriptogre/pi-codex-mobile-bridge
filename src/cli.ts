#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { BridgeSessionRegistry } from "./session-registry.ts";
import { createMobileBridgeServer } from "./server.ts";

const host = "127.0.0.1";
const port = integer(process.env["PI_CODEX_BRIDGE_PORT"], 61340);
const statePath = process.env["PI_CODEX_BRIDGE_STATE"] ?? join(homedir(), ".pi", "agent", "codex-mobile-bridge.json");
const defaultCwd = process.env["PI_CODEX_BRIDGE_CWD"];
const registry = new BridgeSessionRegistry(statePath);
const server = createMobileBridgeServer({ registry, ...(defaultCwd ? { defaultCwd } : {}) });

server.listen(port, host, () => process.stdout.write(`Pi Codex bridge listening on http://${host}:${port}/v1\n`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		server.close(() => void registry.close().finally(() => process.exit(0)));
	});
}

function integer(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("PI_CODEX_BRIDGE_PORT must be a valid port");
	return parsed;
}
