import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PATHS } from "@/config";

export class KokoroUnavailable extends Error {}

type Audio = { samples: Float32Array; sampleRate: number };
type KokoroEngine = {
	generateAsync(request: { text: string; sid: number; speed: number; enableExternalBuffer: boolean; onProgress: () => boolean }): Promise<Audio>;
};

const require = createRequire(import.meta.url);
const modelDirectory = join(/* turbopackIgnore: true */ PATHS.data, "kokoro-int8-multi-lang-v1_1");
let engine: Promise<KokoroEngine> | undefined;

async function loadKokoro(): Promise<KokoroEngine> {
	const file = (name: string) => join(/* turbopackIgnore: true */ modelDirectory, name);
	const required = ["model.int8.onnx", "voices.bin", "tokens.txt", "lexicon-zh.txt", "dict/jieba.dict.utf8",
		"date-zh.fst", "number-zh.fst", "phone-zh.fst"];
	try {
		await Promise.all(required.map(name => access(file(name))));
	} catch {
		throw new KokoroUnavailable("Kokoro is not installed. See Getting started → Listen to Mandarin.");
	}
	const { OfflineTts } = require("sherpa-onnx-node") as {
		OfflineTts: { createAsync(config: Record<string, unknown>): Promise<KokoroEngine> };
	};
	return OfflineTts.createAsync({
		model: {
			kokoro: {
				model: file("model.int8.onnx"),
				voices: file("voices.bin"),
				tokens: file("tokens.txt"),
				lexicon: file("lexicon-zh.txt"),
				dictDir: file("dict"),
			},
			provider: "cpu",
			numThreads: 4,
		},
		ruleFsts: required.slice(-3).map(file).join(","),
		maxNumSentences: 1,
	});
}

function wav({ samples, sampleRate }: Audio): ArrayBuffer {
	if (!samples.length || !Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error("Kokoro returned no audio.");
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const bytes = new Uint8Array(buffer);
	const view = new DataView(buffer);
	const write = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index++) bytes[offset + index] = text.charCodeAt(index);
	};
	write(0, "RIFF");
	view.setUint32(4, buffer.byteLength - 8, true);
	write(8, "WAVEfmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	write(36, "data");
	view.setUint32(40, samples.length * 2, true);
	let offset = 44;
	for (const value of samples) {
		const sample = Math.max(-1, Math.min(1, value));
		view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
		offset += 2;
	}
	return buffer;
}

export async function kokoroAudio(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
	signal.throwIfAborted();
	engine ??= loadKokoro().catch(error => {
		engine = undefined;
		throw error;
	});
	const synth = await engine;
	signal.throwIfAborted();
	// Electron rejects audio arrays backed by memory owned by a native addon.
	const audio = await synth.generateAsync({ text, sid: 3, speed: 1, enableExternalBuffer: false, onProgress: () => !signal.aborted });
	signal.throwIfAborted();
	return wav(audio);
}
