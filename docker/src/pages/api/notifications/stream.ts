import type { APIContext } from 'astro';

import { requireBrowserSession } from '../../../lib/server/cookies';
import { subscribeToNotifications } from '../../../lib/server/chat-service';

const encoder = new TextEncoder();

const sseFrame = (event: string, html: string) =>
  encoder.encode(
    `event: ${event}\n${html
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n')}\n\n`,
  );

export const GET = async (context: APIContext) => {
  const browserSession = requireBrowserSession(context);
  if (!browserSession) {
    return new Response('Unauthorized', { status: 401 });
  }

  let unsubscribe = () => undefined;
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  let finalized = false;

  const cleanup = () => {
    if (finalized) {
      return;
    }

    finalized = true;
    unsubscribe();
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = undefined;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const enqueue = (chunk: Uint8Array) => {
        if (closed || finalized) {
          return;
        }

        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
          cleanup();
        }
      };

      unsubscribe = subscribeToNotifications(browserSession, (html) => {
        enqueue(sseFrame('mention', html));
      });

      keepAliveTimer = setInterval(() => {
        enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 20000);

      context.request.signal.addEventListener(
        'abort',
        () => {
          closed = true;
          cleanup();
          try {
            controller.close();
          } catch {
            // The stream may already be closed or cancelled when the client disconnects.
          }
        },
        { once: true },
      );
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
