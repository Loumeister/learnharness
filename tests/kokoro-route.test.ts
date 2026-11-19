import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const temp = mkdtempSync(join(tmpdir(), "lh-kokoro-test-"));
process.env.LH_DATA_DIR = temp;
const { POST } = await import("../app/api/tts/kokoro/route");
const token = "a".repeat(64);

function request(text: unknown, desktopToken?: string) {
	return new Request("http://127.0.0.1:3000/api/tts/kokoro", {
		method: "POST",
		headers: { "content-type": "application/json", ...(desktopToken ? { "x-learnharness-desktop": desktopToken } : {}) },
		body: JSON.stringify({ text }),
	});
}

after(() => rmdirSync(temp));

test("Kokoro playback is available only to the trusted Windows desktop", async () => {
	delete process.env.LH_DESKTOP_SERVER;
	delete process.env.LH_DESKTOP_API_SECRET;
	assert.equal((await POST(request("你好"))).status, 404);
	process.env.LH_DESKTOP_SERVER = "1";
	process.env.LH_DESKTOP_API_SECRET = token;
	assert.equal((await POST(request("你好"))).status, process.platform === "win32" ? 403 : 404);
});

test("trust and text validation run before local model lookup", { skip: process.platform !== "win32" }, async () => {
	process.env.LH_DESKTOP_SERVER = "1";
	process.env.LH_DESKTOP_API_SECRET = token;
	for (const text of [null, "", "Only English", "你".repeat(201)]) {
		assert.equal((await POST(request(text, token))).status, 400);
	}
	const missing = await POST(request("你好", token));
	assert.equal(missing.status, 503);
	assert.match((await missing.json()).message, /Kokoro/);
});
