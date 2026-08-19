export interface CodexBridgeRequest {
	threadId: string;
	cwd: string;
	prompt: string;
	resumeSessionId?: string;
	thinkingLevel?: "low" | "medium" | "high";
}

export function parseCodexBridgeRequest(value: unknown, defaultCwd?: string): CodexBridgeRequest {
	if (!isRecord(value)) throw new Error("Request body must be an object");
	const metadata = isRecord(value["client_metadata"]) ? value["client_metadata"] : {};
	const threadId = stringValue(metadata["thread_id"]) ?? stringValue(value["prompt_cache_key"]);
	if (!threadId) throw new Error("Codex thread_id is required");

	const messages = Array.isArray(value["input"]) ? value["input"].filter(isMessage) : [];
	const cwd = messages.map(messageText).map(extractCwd).find(Boolean) ?? defaultCwd;
	if (!cwd) throw new Error("Codex working directory is required on the first turn");

	const prompt = [...messages]
		.reverse()
		.filter((message) => message["role"] === "user")
		.map(messageText)
		.find((text) => text.trim() && !text.includes("<environment_context>"));
	if (!prompt) throw new Error("Codex user prompt is required");

	const reasoning = isRecord(value["reasoning"]) ? value["reasoning"] : {};
	const thinkingLevel = bridgeThinkingLevel(reasoning["effort"]);
	const resumeSessionId = parseResumeCommand(prompt);
	return {
		threadId,
		cwd,
		prompt,
		...(resumeSessionId ? { resumeSessionId } : {}),
		...(thinkingLevel ? { thinkingLevel } : {}),
	};
}

function parseResumeCommand(prompt: string): string | undefined {
	const match = prompt.trim().match(/^\/resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
	return match?.[1];
}

function bridgeThinkingLevel(value: unknown): "low" | "medium" | "high" | undefined {
	return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMessage(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && value["type"] === "message";
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function messageText(message: Record<string, unknown>): string {
	if (typeof message["content"] === "string") return message["content"];
	if (!Array.isArray(message["content"])) return "";
	return message["content"]
		.filter(isRecord)
		.filter((part) => part["type"] === "input_text" && typeof part["text"] === "string")
		.map((part) => part["text"] as string)
		.join("\n");
}

function extractCwd(text: string): string | undefined {
	const match = text.match(/<environment_context>[\s\S]*?<cwd>([\s\S]*?)<\/cwd>[\s\S]*?<\/environment_context>/);
	return match?.[1]?.trim();
}
