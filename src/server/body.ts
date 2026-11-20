/** Read at most the configured number of bytes, including chunked request bodies. */
export async function boundedText(request: Request, maximumBytes: number): Promise<string | null> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maximumBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const buffer = new Uint8Array(maximumBytes);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > maximumBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      buffer.set(value, size);
      size += value.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
  } finally {
    reader.releaseLock();
  }
}
