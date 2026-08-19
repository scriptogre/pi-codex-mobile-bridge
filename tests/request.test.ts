import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexBridgeRequest } from "../src/request.ts";

test("parseCodexBridgeRequest maps Codex metadata and latest user prompt", () => {
	assert.deepEqual(parseCodexBridgeRequest({
		prompt_cache_key: "fallback",
		client_metadata: { thread_id: "thread-1", turn_id: "turn-1" },
		reasoning: { effort: "medium" },
		input: [
			{ type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>\n  <cwd>/work/project</cwd>\n</environment_context>" }] },
			{ type: "message", role: "assistant", content: [{ type: "output_text", text: "old" }] },
			{ type: "message", role: "user", content: [{ type: "input_text", text: "Fix the tests" }] },
		],
	}), {
		threadId: "thread-1",
		cwd: "/work/project",
		prompt: "Fix the tests",
		thinkingLevel: "medium",
	});
});

test("parseCodexBridgeRequest accepts a configured default cwd", () => {
	const request = parseCodexBridgeRequest({
		prompt_cache_key: "thread-2",
		input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] }],
	}, "/work/default");
	assert.equal(request.cwd, "/work/default");
});

test("parseCodexBridgeRequest recognizes an exact resume command", () => {
	const request = parseCodexBridgeRequest({
		prompt_cache_key: "thread-2",
		input: [{ type: "message", role: "user", content: "/resume 019fe258-6b88-782c-b4ff-05e8f1d20390" }],
	}, "/work/default");
	assert.equal(request.resumeSessionId, "019fe258-6b88-782c-b4ff-05e8f1d20390");
});
