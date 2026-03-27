import type { APIContext } from 'astro';

import { requireBrowserSession, requireNickname } from '../../../lib/server/cookies';
import { postMessage } from '../../../lib/server/chat-service';
import { renderErrorFragment } from '../../../lib/server/render';
import { messageSchema } from '../../../lib/server/validators';

export const POST = async (context: APIContext) => {
  const nickname = requireNickname(context);
  const browserSession = requireBrowserSession(context);
  if (!nickname || !browserSession) {
    return new Response(renderErrorFragment('Pick a nickname before sending messages.'), {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }

  const roomId = Number(context.params.id);
  if (!Number.isFinite(roomId)) {
    return new Response(renderErrorFragment('Invalid room.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const formData = await context.request.formData();
  const body = messageSchema.safeParse(formData.get('body'));

  if (!body.success) {
    return new Response(renderErrorFragment(body.error.issues[0]?.message ?? 'Invalid message.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    await postMessage(roomId, browserSession, nickname, body.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send message.';
    return new Response(renderErrorFragment(message), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
};
