import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

export interface BridgeSession {
	readonly sessionFile: string | undefined;
	prompt(message: string): Promise<void>;
	subscribe(listener: (event: unknown) => void): () => void;
	setThinkingLevel(level: "low" | "medium" | "high"): void;
	abort(): void;
	dispose(): void;
}

interface StoredSession {
	cwd: string;
	sessionFile: string;
}

export class BridgeSessionRegistry {
	private readonly active = new Map<string, Promise<BridgeSession>>();
	private readonly statePath: string;
	private saveChain = Promise.resolve();
	private stored?: Record<string, StoredSession>;

	constructor(statePath: string) {
		this.statePath = statePath;
	}

	async get(threadId: string, cwd: string): Promise<BridgeSession> {
		const existing = this.active.get(threadId);
		if (existing) return existing;
		const pending = this.open(threadId, cwd);
		this.active.set(threadId, pending);
		try {
			return await pending;
		} catch (error) {
			this.active.delete(threadId);
			throw error;
		}
	}

	async resume(threadId: string, cwd: string, sessionId: string): Promise<void> {
		const sessionFile = await findSessionFile(sessionId);
		if (!sessionFile) throw new Error(`Pi session ${sessionId} was not found`);
		const active = await this.active.get(threadId);
		active?.dispose();
		this.active.delete(threadId);
		(await this.load())[threadId] = { cwd, sessionFile };
		await this.save();
	}

	async close(): Promise<void> {
		const sessions = await Promise.allSettled(this.active.values());
		for (const result of sessions) if (result.status === "fulfilled") result.value.dispose();
		this.active.clear();
	}

	private async open(threadId: string, cwd: string): Promise<BridgeSession> {
		const stored = (await this.load())[threadId];
		const sessionManager = stored ? SessionManager.open(stored.sessionFile) : SessionManager.create(cwd);
		const { session } = await createAgentSession({ cwd: stored?.cwd ?? cwd, sessionManager });
		if (!stored && session.sessionFile) {
			this.stored![threadId] = { cwd, sessionFile: session.sessionFile };
			await this.save();
		}
		return session;
	}

	private async load(): Promise<Record<string, StoredSession>> {
		if (this.stored) return this.stored;
		try {
			const value = JSON.parse(await readFile(this.statePath, "utf8")) as unknown;
			this.stored = isStoredSessions(value) ? value : {};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			this.stored = {};
		}
		return this.stored;
	}

	private async save(): Promise<void> {
		const write = async () => {
			await mkdir(dirname(this.statePath), { recursive: true, mode: 0o700 });
			const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
			await writeFile(temporaryPath, `${JSON.stringify(this.stored, null, 2)}\n`, { mode: 0o600 });
			await rename(temporaryPath, this.statePath);
		};
		this.saveChain = this.saveChain.then(write, write);
		await this.saveChain;
	}
}

async function findSessionFile(sessionId: string): Promise<string | undefined> {
	const agentDir = process.env["PI_CODING_AGENT_DIR"] ?? join(homedir(), ".pi", "agent");
	const sessionsDir = join(agentDir, "sessions");
	let entries;
	try {
		entries = await readdir(sessionsDir, { recursive: true, withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	const filename = entries.find((entry) => entry.isFile() && entry.name.endsWith(`_${sessionId}.jsonl`));
	return filename ? join(filename.parentPath, filename.name) : undefined;
}

function isStoredSessions(value: unknown): value is Record<string, StoredSession> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.values(value).every((entry) => Boolean(entry)
		&& typeof entry === "object"
		&& typeof (entry as StoredSession).cwd === "string"
		&& typeof (entry as StoredSession).sessionFile === "string");
}
