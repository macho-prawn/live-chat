import type { APIContext } from 'astro';

import { requireNickname } from '../../../lib/server/cookies';
import { getMessagePage } from '../../../lib/server/chat-service';
import { renderHistoryRegion, renderMessageItems } from '../../../lib/server/render';

export const GET = async (context: APIContext) => {
  const nickname = requireNickname(context);
  if (!nickname) {
    return new Response('', {
      status: 401,
      headers: { 'HX-Redirect': '/nickname' },
    });
  }

  const roomId = Number(context.params.id);
  const before = context.url.searchParams.get('before');

  if (!Number.isFinite(roomId)) {
    return new Response('Invalid room', { status: 404 });
  }

  try {
    const page = await getMessagePage(roomId, before);
    const historyRegionHtml = renderHistoryRegion(roomId, page.nextCursor).replace(
      '<div id="history-region"',
      '<div id="history-region" hx-swap-oob="outerHTML"',
    );

    return new Response(
      `
        ${historyRegionHtml}
        <template hx-swap-oob="afterbegin:#message-list">
          ${renderMessageItems(page.messages)}
        </template>
      `,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      },
    );
  } catch {
    return new Response('Unable to load history', { status: 400 });
  }
};
