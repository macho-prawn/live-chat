import type { APIContext } from 'astro';

import { getOrCreateBrowserSession, setNicknameCookie } from '../../lib/server/cookies';
import { ensureLobbyRoom, reserveNickname } from '../../lib/server/chat-service';
import { renderErrorFragment } from '../../lib/server/render';
import { nicknameSchema } from '../../lib/server/validators';

export const POST = async ({ request, cookies }: APIContext) => {
  const formData = await request.formData();
  const parsed = nicknameSchema.safeParse(formData.get('nickname'));

  if (!parsed.success) {
    return new Response(renderErrorFragment(parsed.error.issues[0]?.message ?? 'Invalid nickname.'), {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  try {
    const browserSession = getOrCreateBrowserSession(cookies);
    await reserveNickname(parsed.data, browserSession);
    setNicknameCookie(cookies, parsed.data);
    const lobby = await ensureLobbyRoom();

    return new Response(null, {
      status: 204,
      headers: {
        'HX-Redirect': `/rooms/${lobby.id}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to claim nickname.';
    return new Response(renderErrorFragment(message), {
      status: 409,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
};
