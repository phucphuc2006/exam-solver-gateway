import { statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const encoder = new TextEncoder();
  const state = { closed: false, keepalive: null, flushing: false, flushAgain: false };
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      let scheduleFlush = () => {};

      cleanup = () => {
        if (state.closed) return;
        state.closed = true;
        statsEmitter.off("update", scheduleFlush);
        statsEmitter.off("pending", scheduleFlush);
        clearInterval(state.keepalive);
      };

      const flush = async () => {
        if (state.closed || state.flushing) return;
        state.flushing = true;

        try {
          do {
            state.flushAgain = false;
            const snapshot = await getActiveRequests();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));
          } while (!state.closed && state.flushAgain);
        } catch {
          cleanup();
        } finally {
          state.flushing = false;
        }
      };

      scheduleFlush = () => {
        if (state.closed) return;
        if (state.flushing) {
          state.flushAgain = true;
          return;
        }
        void flush();
      };

      request?.signal?.addEventListener("abort", cleanup, { once: true });

      scheduleFlush();
      console.log(`[SSE] Client connected | listeners=${statsEmitter.listenerCount("update") + 1}`);

      statsEmitter.on("update", scheduleFlush);
      statsEmitter.on("pending", scheduleFlush);

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25000);
    },

    cancel() {
      cleanup();
      console.log("[SSE] Client disconnected");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
