/** Release-only reads: tolerate propagation, never accept a different revision. */
export async function releaseResponse(
  url: string,
  expected: string | undefined,
  options: {
    init?: RequestInit;
    fetcher?: typeof fetch;
    pause?: () => Promise<void>;
    attempts?: number;
    deadline?: number;
  } = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const pause = options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 5000)));
  const deadline = options.deadline ?? Date.now() + 90000;
  const attempts = options.attempts ?? 12;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, { ...options.init, signal: AbortSignal.timeout(20000) });
    } catch (error) {
      if (attempt === attempts || Date.now() >= deadline) throw error;
      await pause();
      continue;
    }
    // Callers check expected status; an application failure gets no retry.
    if (
      response.status >= 500 ||
      !expected ||
      response.headers.get("x-cheapseggs-revision") === expected
    )
      return response;
    await response.body?.cancel();
    if (attempt === attempts || Date.now() >= deadline)
      throw new Error(`Expected deployment revision not observed at ${new URL(url).pathname}`);
    console.log(
      `Waiting for expected revision at ${new URL(url).pathname} (${attempt}/${attempts}).`,
    );
    await pause();
  }
  throw new Error("Release response attempts exhausted");
}
