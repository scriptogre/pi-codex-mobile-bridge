import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createMobileBridgeServer } from "../src/server.ts";
import type { BridgeSession } from "../src/session-registry.ts";

test("mobile bridge streams Pi text as an OpenAI Responses result", async () => {
	const listeners = new Set<(event: unknown) => void>();
	const prompts: string[] = [];
	const thinkingLevels: string[] = [];
	const session: BridgeSession = {
		sessionFile: undefined,
		prompt: async (message) => {
			prompts.push(message);
			for (const delta of ["Hello", " from Pi"]) {
				for (const listener of listeners) listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
			}
		},
		subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
		setThinkingLevel: (level) => { thinkingLevels.push(level); },
		abort: () => {},
		dispose: () => {},
	};
	const server = createMobileBridgeServer({
		registry: { get: async () => session, resume: async () => {} },
		defaultCwd: "/work/project",
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const { port } = server.address() as AddressInfo;
		const modelsResponse = await fetch(`http://127.0.0.1:${port}/v1/models?client_version=0.146.0`);
		const models = await modelsResponse.json() as { models: Array<{ slug: string }> };
		assert.equal(models.models[0]?.slug, "pi");
		const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_metadata: { thread_id: "thread-1" },
				reasoning: { effort: "high" },
				input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Do work" }] }],
			}),
		});
		const body = await response.text();
		assert.equal(response.status, 200);
		assert.deepEqual(prompts, ["Do work"]);
		assert.deepEqual(thinkingLevels, ["high"]);
		assert.match(body, /response\.output_text\.delta/);
		assert.match(body, /Hello from Pi/);
		assert.match(body, /response\.completed/);
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	}
});

test("mobile bridge binds a Codex thread to an existing Pi session", async () => {
	const resumed: string[][] = [];
	const server = createMobileBridgeServer({
		registry: {
			get: async () => { throw new Error("resume must not open a new session"); },
			resume: async (...args) => { resumed.push(args); },
		},
		defaultCwd: "/home/chris",
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const { port } = server.address() as AddressInfo;
		const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_metadata: { thread_id: "mobile-thread" },
				input: [{ type: "message", role: "user", content: "/resume 019fe258-6b88-782c-b4ff-05e8f1d20390" }],
			}),
		});
		const body = await response.text();
		assert.equal(response.status, 200);
		assert.deepEqual(resumed, [["mobile-thread", "/home/chris", "019fe258-6b88-782c-b4ff-05e8f1d20390"]]);
		assert.match(body, /Pi session resumed/);
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	}
});
