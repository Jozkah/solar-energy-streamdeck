/**
 * Minimal Server-Sent Events reader built on global `fetch` (Node 20+), so no
 * extra dependency and no hand-rolled WebSocket. Parses `data:` frames and
 * ignores comments/pings (`: ping`). Cancellable via AbortSignal.
 */

export interface SseHandlers {
  onData: (raw: string) => void;
  onOpen?: () => void;
  onError: (err: unknown) => void;
}

/**
 * Open an SSE stream and pump frames to handlers until the signal aborts or the
 * stream ends/errors. Resolves when the stream closes; never throws (errors go
 * to onError).
 */
export async function openSse(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  handlers: SseHandlers,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/event-stream", ...headers },
      signal,
    });
    if (!res.ok || !res.body) {
      handlers.onError(new Error(`SSE HTTP ${res.status}`));
      return;
    }
    handlers.onOpen?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Split on event boundaries (blank line).
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          // ':' comment lines (pings) and other fields are ignored.
        }
        if (dataLines.length) handlers.onData(dataLines.join("\n"));
      }
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return;
    handlers.onError(err);
  }
}
