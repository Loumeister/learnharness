/** The desktop playback action accepts a short visible Chinese selection. */
export function isMandarinSpeechText(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const text = value.trim();
	return text.length <= 200 && /\p{Script=Han}/u.test(text);
}
