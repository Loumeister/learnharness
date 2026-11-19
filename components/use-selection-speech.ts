"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { isMandarinSpeechText } from "@/src/core";
import type { SelectionAction } from "./selection-toolbar";

type Playback = {
	request: AbortController;
	audio?: HTMLAudioElement;
	url?: string;
};

function release(playback: Playback) {
	playback.request.abort();
	playback.audio?.pause();
	if (playback.url) URL.revokeObjectURL(playback.url);
}

export function useSelectionSpeech() {
	const current = useRef<Playback | null>(null);
	const [playing, setPlaying] = useState(false);
	const [error, setError] = useState<string>();

	useEffect(() => () => {
		if (current.current) release(current.current);
		current.current = null;
	}, []);

	const action = useMemo<SelectionAction>(() => ({
		id: "read-mandarin",
		label: "Read aloud",
		ariaLabel: "Read the selected Chinese text aloud",
		icon: Volume2,
		visible: ({ selector }) =>
			window.lh?.platform === "win32" && /\p{Script=Han}/u.test(selector.text),
		disabledLabel: ({ selector }) => playing ? "Kokoro is playing"
			: isMandarinSpeechText(selector.text) ? null : "Shorten selection",
		onSelect: ({ selector }) => {
			if (current.current || !isMandarinSpeechText(selector.text)) return false;
			const playback: Playback = { request: new AbortController() };
			current.current = playback;
			setError(undefined);
			setPlaying(true);

			const finish = (message?: string) => {
				if (current.current !== playback) return;
				current.current = null;
				release(playback);
				setPlaying(false);
				setError(message);
			};
			void (async () => {
				try {
					const response = await fetch("/api/tts/kokoro", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ text: selector.text }),
						signal: playback.request.signal,
					});
					if (!response.ok) {
						const detail = await response.json().catch(() => ({})) as { message?: string };
						throw new Error(detail.message ?? "Kokoro could not generate audio.");
					}
					const output = await response.blob();
					if (current.current !== playback) return;
					playback.url = URL.createObjectURL(output);
					playback.audio = new Audio(playback.url);
					playback.audio.onended = () => finish();
					playback.audio.onerror = () => finish("The generated audio could not be played.");
					await playback.audio.play();
				} catch (cause) {
					finish(cause instanceof Error ? cause.message : "Kokoro playback failed.");
				}
			})();
			return true;
		},
	}), [playing]);

	function stop() {
		const playback = current.current;
		if (!playback) return;
		current.current = null;
		release(playback);
		setPlaying(false);
	}

	return { action, playing, error, stop };
}
