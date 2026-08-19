import assert from "node:assert/strict";
import test from "node:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { bridgeResourceSettings } from "../src/session-registry.ts";

test("bridge resources exclude pi-codex-conversion only", () => {
	const source = SettingsManager.inMemory({
		packages: [
			"npm:@howaboua/pi-codex-conversion",
			"git:github.com/scriptogre/pi-dictate",
			{ source: "npm:@howaboua/pi-codex-conversion@3.0.16", autoload: false },
		],
	});

	assert.deepEqual(bridgeResourceSettings(source).getGlobalSettings().packages, [
		"git:github.com/scriptogre/pi-dictate",
	]);
});
