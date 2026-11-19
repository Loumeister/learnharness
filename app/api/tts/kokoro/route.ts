import { browserOnlyMode, desktopAPIAuthorized, KokoroUnavailable, kokoroAudio } from "@/src/server";
import { isMandarinSpeechText } from "@/src/core";

let generating = false;

export async function POST(request: Request) {
	if (process.platform !== "win32" || browserOnlyMode()) {
		return Response.json({ message: "Kokoro playback is available in LearnHarness for Windows." }, { status: 404 });
	}
	if (!desktopAPIAuthorized(request.headers)) {
		return Response.json({ message: "Playback requires a trusted LearnHarness window." }, { status: 403 });
	}
	const body: unknown = await request.json().catch(() => null);
	const text = body && typeof body === "object" && "text" in body ? body.text : undefined;
	if (!isMandarinSpeechText(text)) {
		return Response.json({ message: "Select a Chinese word or short sentence." }, { status: 400 });
	}
	if (generating) {
		return Response.json({ message: "Kokoro is still generating audio. Try again in a moment." }, { status: 409 });
	}
	generating = true;
	try {
		const audio = await kokoroAudio(text.trim(), request.signal);
		return new Response(audio, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
	} catch (error) {
		if (request.signal.aborted) return new Response(null, { status: 204 });
		if (error instanceof KokoroUnavailable) return Response.json({ message: error.message }, { status: 503 });
		console.error("Kokoro playback failed", error);
		return Response.json({ message: "Kokoro could not generate audio. Check the local voice files." }, { status: 500 });
	} finally {
		generating = false;
	}
}
