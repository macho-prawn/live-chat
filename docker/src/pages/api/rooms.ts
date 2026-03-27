import type { APIContext } from 'astro';

import { requireNickname } from '../../lib/server/cookies';
import { createRoom, isRoomDuplicateError } from '../../lib/server/chat-service';
import { renderErrorFragment } from '../../lib/server/render';
import { roomSchema } from '../../lib/server/validators';

export const POST = async (context: APIContext) => {
  const nickname = requireNickname(context);
  if (!nickname) {
    return new Response(renderErrorFragment('Pick a nickname before creating a room.'), {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Redirect': '/nickname',
      },
    });
  }

  const formData = await context.request.formData();
  const parsed = roomSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
  });

  if (!parsed.success) {
    return new Response(renderErrorFragment(parsed.error.issues[0]?.message ?? 'Invalid room.'), {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  try {
    const room = await createRoom(parsed.data.name, parsed.data.description);
    return new Response(null, {
      status: 204,
      headers: {
        'HX-Redirect': `/rooms/${room.id}`,
      },
    });
  } catch (error) {
    const message = isRoomDuplicateError(error) ? 'A room with that name already exists.' : 'Unable to create room.';
    return new Response(renderErrorFragment(message), {
      status: isRoomDuplicateError(error) ? 409 : 500,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
};
