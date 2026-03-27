import type { APIContext } from 'astro';

import { requireBrowserSession, requireNickname } from '../../lib/server/cookies';
import { getMentionCandidates } from '../../lib/server/chat-service';

export const GET = async (context: APIContext) => {
  const nickname = requireNickname(context);
  const browserSession = requireBrowserSession(context);
  if (!nickname || !browserSession) {
    return new Response(JSON.stringify({ nicknames: [] }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }

  const roomId = Number(context.url.searchParams.get('roomId'));
  if (!Number.isFinite(roomId)) {
    return new Response(JSON.stringify({ nicknames: [] }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  const query = context.url.searchParams.get('q') ?? '';
  const nicknames = await getMentionCandidates(roomId, query, browserSession);

  return new Response(JSON.stringify({ nicknames }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
