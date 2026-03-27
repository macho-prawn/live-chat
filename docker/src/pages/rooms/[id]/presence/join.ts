import type { APIContext } from 'astro';

import { requireBrowserSession, requireNickname } from '../../../../lib/server/cookies';
import { joinRoomPresence } from '../../../../lib/server/chat-service';
import { renderErrorFragment } from '../../../../lib/server/render';
import { tabIdSchema } from '../../../../lib/server/validators';

export const POST = async (context: APIContext) => {
  const nickname = requireNickname(context);
  const browserSession = requireBrowserSession(context);
  if (!nickname || !browserSession) {
    return new Response(renderErrorFragment('Pick a nickname before joining a room.'), {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }

  const roomId = Number(context.params.id);
  if (!Number.isFinite(roomId)) {
    return new Response(null, { status: 404 });
  }

  const formData = await context.request.formData();
  const tabId = tabIdSchema.safeParse(formData.get('tabId'));
  if (!tabId.success) {
    return new Response(null, { status: 400 });
  }

  try {
    await joinRoomPresence(roomId, nickname, browserSession, tabId.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to join the room.';
    return new Response(renderErrorFragment(message), {
      status: 409,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }
};
