import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export class CodexResponsesStream {
	private readonly responseId = `resp_${randomUUID()}`;
	private readonly messageId = `msg_${randomUUID()}`;
	private readonly response: ServerResponse;
	private text = "";

	constructor(response: ServerResponse) {
		this.response = response;
	}

	start(): void {
		this.response.writeHead(200, {
			"cache-control": "no-cache",
			"content-type": "text/event-stream",
			"x-content-type-options": "nosniff",
		});
		this.send({ type: "response.created", response: { id: this.responseId, status: "in_progress", output: [] } });
		this.send({
			type: "response.output_item.added",
			output_index: 0,
			item: { type: "message", id: this.messageId, role: "assistant", status: "in_progress", content: [] },
		});
		this.send({
			type: "response.content_part.added",
			output_index: 0,
			content_index: 0,
			item_id: this.messageId,
			part: { type: "output_text", text: "", annotations: [] },
		});
	}

	delta(text: string): void {
		if (!text) return;
		this.text += text;
		this.send({
			type: "response.output_text.delta",
			output_index: 0,
			content_index: 0,
			item_id: this.messageId,
			delta: text,
			logprobs: [],
		});
	}

	complete(): void {
		const part = { type: "output_text", text: this.text, annotations: [] };
		const item = { type: "message", id: this.messageId, role: "assistant", status: "completed", content: [part] };
		this.send({ type: "response.output_text.done", output_index: 0, content_index: 0, item_id: this.messageId, text: this.text, logprobs: [] });
		this.send({ type: "response.content_part.done", output_index: 0, content_index: 0, item_id: this.messageId, part });
		this.send({ type: "response.output_item.done", output_index: 0, item });
		this.send({
			type: "response.completed",
			response: {
				id: this.responseId,
				status: "completed",
				output: [item],
				usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 } },
			},
		});
		this.response.end();
	}

	fail(error: unknown): void {
		this.send({
			type: "response.failed",
			response: {
				id: this.responseId,
				status: "failed",
				error: { code: "pi_bridge_error", message: error instanceof Error ? error.message : String(error) },
			},
		});
		this.response.end();
	}

	private send(value: unknown): void {
		this.response.write(`data: ${JSON.stringify(value)}\n\n`);
	}
}
