export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown | "invalid" | "too-large"> {
  if (!request.body) return "invalid";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return "too-large";
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return "invalid";
  }
}
