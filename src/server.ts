import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PI_BRIDGE_MODELS } from "./models.ts";
import { parseCodexBridgeRequest } from "./request.ts";
import { CodexResponsesStream } from "./responses.ts";
import type { BridgeSession } from "./session-registry.ts";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

export interface BridgeRegistry {
	get(threadId: string, cwd: string): Promise<BridgeSession>;
	resume(threadId: string, cwd: string, sessionId: string): Promise<void>;
}

export function createMobileBridgeServer(options: {
	registry: BridgeRegistry;
	defaultCwd?: string;
}): Server {
	const running = new Set<string>();
	return createServer(async (request, response) => {
		try {
			if (request.method === "GET" && request.url?.startsWith("/v1/models")) {
				sendJson(response, 200, PI_BRIDGE_MODELS);
				return;
			}
			if (request.method !== "POST" || request.url !== "/v1/responses") {
				sendJson(response, 404, { error: { message: "Not found" } });
				return;
			}
			const bridgeRequest = parseRequest(await readJson(request), options.defaultCwd);
			if (running.has(bridgeRequest.threadId)) {
				sendJson(response, 409, { error: { message: "This Pi session is already running" } });
				return;
			}
			running.add(bridgeRequest.threadId);
			try {
				if (bridgeRequest.resumeSessionId) {
					await options.registry.resume(bridgeRequest.threadId, bridgeRequest.cwd, bridgeRequest.resumeSessionId);
					const stream = new CodexResponsesStream(response);
					stream.start();
					stream.delta("Pi session resumed. Send your next message to continue.");
					stream.complete();
					return;
				}
				const session = await options.registry.get(bridgeRequest.threadId, bridgeRequest.cwd);
				if (bridgeRequest.thinkingLevel) session.setThinkingLevel(bridgeRequest.thinkingLevel);
				const stream = new CodexResponsesStream(response);
				let settled = false;
				const unsubscribe = session.subscribe((event) => {
					if (!isTextDelta(event)) return;
					stream.delta(event.assistantMessageEvent.delta);
				});
				response.on("close", () => { if (!settled) session.abort(); });
				stream.start();
				try {
					await session.prompt(bridgeRequest.prompt);
					settled = true;
					stream.complete();
				} catch (error) {
					settled = true;
					stream.fail(error);
				} finally {
					unsubscribe();
				}
			} finally {
				running.delete(bridgeRequest.threadId);
			}
		} catch (error) {
			if (!response.headersSent) sendJson(response, requestErrorStatus(error), { error: { message: errorMessage(error) } });
			else response.end();
		}
	});
}

function parseRequest(value: unknown, defaultCwd?: string) {
	try {
		return parseCodexBridgeRequest(value, defaultCwd);
	} catch (error) {
		throw new BridgeRequestError(400, errorMessage(error));
	}
}

async function readJson(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > MAX_REQUEST_BYTES) throw new BridgeRequestError(413, "Request body is too large");
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new BridgeRequestError(400, "Request body must be JSON");
	}
}

function isTextDelta(event: unknown): event is { assistantMessageEvent: { type: "text_delta"; delta: string } } {
	if (!event || typeof event !== "object") return false;
	const update = (event as { type?: unknown; assistantMessageEvent?: unknown });
	if (update.type !== "message_update" || !update.assistantMessageEvent || typeof update.assistantMessageEvent !== "object") return false;
	const delta = update.assistantMessageEvent as { type?: unknown; delta?: unknown };
	return delta.type === "text_delta" && typeof delta.delta === "string";
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
	response.writeHead(status, { "content-type": "application/json", "x-content-type-options": "nosniff" });
	response.end(JSON.stringify(value));
}

function requestErrorStatus(error: unknown): number {
	return error instanceof BridgeRequestError ? error.status : 500;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class BridgeRequestError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}
