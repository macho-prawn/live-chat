import type { APIContext } from 'astro';

import { requireBrowserSession, requireNickname } from '../../../lib/server/cookies';
import { refreshTyping, stopTyping } from '../../../lib/server/chat-service';
import { renderErrorFragment } from '../../../lib/server/render';
import { tabIdSchema } from '../../../lib/server/validators';

export const POST = async (context: APIContext) => {
  const nickname = requireNickname(context);
  const browserSession = requireBrowserSession(context);
  if (!nickname || !browserSession) {
    return new Response(renderErrorFragment('Pick a nickname before typing.'), {
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
    if (context.url.searchParams.get('stop') === '1') {
      await stopTyping(roomId, browserSession, tabId.data);
    } else {
      await refreshTyping(roomId, nickname, browserSession, tabId.data);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update typing state.';
    return new Response(renderErrorFragment(message), {
      status: 409,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }
};
