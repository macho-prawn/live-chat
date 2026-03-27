import type { APIContext } from 'astro';

import { requireBrowserSession, requireNickname, setNicknameCookie } from '../../lib/server/cookies';
import { updateProfile } from '../../lib/server/chat-service';
import { renderErrorFragment } from '../../lib/server/render';
import { profileSchema } from '../../lib/server/validators';

export const POST = async (context: APIContext) => {
  const currentNickname = requireNickname(context);
  const browserSession = requireBrowserSession(context);
  if (!currentNickname || !browserSession) {
    return new Response(renderErrorFragment('Pick a nickname before updating your profile.'), {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }

  const formData = await context.request.formData();
  const parsed = profileSchema.safeParse({
    nickname: formData.get('nickname'),
    nicknameColor: formData.get('nicknameColor'),
  });

  if (!parsed.success) {
    return new Response(renderErrorFragment(parsed.error.issues[0]?.message ?? 'Invalid profile update.'), {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  try {
    const profile = await updateProfile(browserSession, currentNickname, parsed.data.nickname, parsed.data.nicknameColor);
    setNicknameCookie(context.cookies, profile.nickname);

    return new Response(
      JSON.stringify({
        nickname: profile.nickname,
        nicknameColor: profile.nicknameColor,
      }),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile.';
    return new Response(renderErrorFragment(message), {
      status: 409,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
};
