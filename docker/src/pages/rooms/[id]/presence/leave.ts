import type { APIContext } from 'astro';

import { requireBrowserSession, requireNickname } from '../../../../lib/server/cookies';
import { leaveRoomPresence } from '../../../../lib/server/chat-service';
import { tabIdSchema } from '../../../../lib/server/validators';

export const POST = async (context: APIContext) => {
  const nickname = requireNickname(context);
  const browserSession = requireBrowserSession(context);
  if (!nickname || !browserSession) {
    return new Response(null, { status: 204 });
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

  await leaveRoomPresence(roomId, nickname, browserSession, tabId.data);
  return new Response(null, { status: 204 });
};
