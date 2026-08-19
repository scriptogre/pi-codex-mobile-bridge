# Pi Codex Mobile Bridge

Expose Pi sessions to the Codex mobile app through an OpenAI Responses-compatible server.

```bash
bun install
bun run build
pi-codex-mobile-bridge
```

The server listens on `127.0.0.1:61340`.

## Configuration

| Variable | Default |
| --- | --- |
| `PI_CODEX_BRIDGE_PORT` | `61340` |
| `PI_CODEX_BRIDGE_CWD` | Request working directory |
| `PI_CODEX_BRIDGE_STATE` | `~/.pi/agent/codex-mobile-bridge.json` |
| `PI_CODING_AGENT_DIR` | `~/.pi/agent` |
