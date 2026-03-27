import type { APIContext } from 'astro';

import { requireNickname } from '../../../lib/server/cookies';
import { getLatestRoomState, getRoomNavHtml, subscribeToRoom, subscribeToRoomList } from '../../../lib/server/chat-service';

const encoder = new TextEncoder();

const sseFrame = (event: string, html: string) =>
  encoder.encode(
    `event: ${event}\n${html
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n')}\n\n`,
  );

export const GET = async (context: APIContext) => {
  const nickname = requireNickname(context);
  if (!nickname) {
    return new Response('Unauthorized', { status: 401 });
  }

  const roomId = Number(context.params.id);

  if (!Number.isFinite(roomId)) {
    return new Response('Bad request', { status: 400 });
  }

  const [initialState, initialRoomNavHtml] = await Promise.all([
    getLatestRoomState(roomId),
    getRoomNavHtml(roomId),
  ]);

  let unsubscribeRoom = () => undefined;
  let unsubscribeRooms = () => undefined;
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  let finalized = false;

  const cleanup = () => {
    if (finalized) {
      return;
    }

    finalized = true;
    unsubscribeRoom();
    unsubscribeRooms();
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

      enqueue(sseFrame('presence', initialState.presenceHtml));
      enqueue(sseFrame('typing', initialState.typingHtml));
      enqueue(sseFrame('activity', initialState.activityHtml));
      enqueue(sseFrame('rooms', initialRoomNavHtml));

      unsubscribeRoom = subscribeToRoom(roomId, (payload) => {
        enqueue(sseFrame(payload.event, payload.html));
      });

      unsubscribeRooms = subscribeToRoomList(() => {
        void getRoomNavHtml(roomId)
          .then((html) => {
            enqueue(sseFrame('rooms', html));
          })
          .catch(() => undefined);
      });

      keepAliveTimer = setInterval(() => {
        enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 20000);

      context.request.signal.addEventListener('abort', () => {
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // The stream may already be closed or cancelled when the client disconnects.
        }
      }, { once: true });
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
