import type { MentionNotification, PresenceEntry, TypingEntry } from './chat-state';
import type { Message, Room, RoomActivityEvent } from './schema';

import { formatDateTime, formatRelativeTime, formatTime } from './format';

const DEFAULT_NICKNAME_COLOR = '#34d399';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const flattenText = (value: string) => escapeHtml(value).replace(/\s+/g, ' ').trim();
const normalizeMentions = (value: string) => flattenText(value).replace(/@\[([^\]]+)\]/g, '@$1');
const normalizeColor = (value: string | null | undefined) => (/^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value! : DEFAULT_NICKNAME_COLOR);
const colorStyle = (value: string | null | undefined) => `style="color: ${normalizeColor(value)};"`;

const renderActivityLabel = (event: RoomActivityEvent) => {
  switch (event.type) {
    case 'joined':
      return 'joined the room';
    case 'left':
      return 'left the room';
    case 'rejoined':
      return 'rejoined the room';
    case 'nickname_changed':
      return event.previousNickname
        ? `changed nickname from ${escapeHtml(event.previousNickname)}`
        : 'changed nickname';
    default:
      return 'updated activity';
  }
};

export const encodeCursor = (message: Pick<Message, 'id' | 'createdAt'>) =>
  Buffer.from(JSON.stringify({ id: message.id, createdAt: message.createdAt.toISOString() })).toString('base64url');

export const decodeCursor = (value: string) => {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      id: number;
      createdAt: string;
    };

    return {
      id: decoded.id,
      createdAt: new Date(decoded.createdAt),
    };
  } catch {
    return null;
  }
};

export const renderMessageItem = (message: Message) => {
  const timestamp = formatTime(message.createdAt);

  if (message.type === 'system') {
    return `
      <li
        id="message-${message.id}"
        class="mx-auto max-w-md px-1 py-0.5 text-center text-[10px] leading-tight text-slate-500"
        title="${formatDateTime(message.createdAt)}"
      >
        <div class="inline-flex rounded-full border border-slate-800/60 bg-slate-900/50 px-2 py-0.5 font-medium text-[10px] text-slate-400">
          ${escapeHtml(message.body)}
        </div>
      </li>
    `;
  }

  const body = normalizeMentions(message.body);

  return `
    <li id="message-${message.id}" class="app-message-row px-2.5 py-1.5 text-sm leading-5">
      <span class="app-message-author font-semibold" ${colorStyle(message.nicknameColor)}>${escapeHtml(message.nickname)}</span>
      <time class="app-faint text-xs" datetime="${message.createdAt.toISOString()}" title="${formatDateTime(message.createdAt)}">(${timestamp})</time>
      <span class="app-faint">:</span>
      <span class="app-subtext">${body}</span>
    </li>
  `;
};

export const renderMessageItems = (messages: Message[]) => messages.map(renderMessageItem).join('');

export const renderPresenceCard = (entries: PresenceEntry[]) => {
  const count = entries.length;
  const summaryLabel = count === 1 ? '1 online' : `${count} online`;
  const detailsBody =
    count === 0
      ? '<p class="app-muted text-sm">Nobody online yet.</p>'
      : `
        <ul class="space-y-2.5">
          ${entries
            .map(
              (entry) => `
                <li class="app-card flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                  <div class="flex min-w-0 items-center gap-2 text-sm font-semibold" data-presence-nickname="${escapeHtml(entry.nickname)}">
                    <span class="inline-flex size-2 rounded-full bg-emerald-400"></span>
                    <span class="truncate" ${colorStyle(entry.nicknameColor)}>${escapeHtml(entry.nickname)}</span>
                    <span data-you-badge class="app-you-badge hidden rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">You</span>
                  </div>
                  <p class="app-faint shrink-0 text-xs" title="${formatDateTime(entry.joinedAt)}">
                    ${escapeHtml(formatRelativeTime(entry.joinedAt))}
                  </p>
                </li>
              `,
            )
            .join('')}
        </ul>
      `;

  return `
    <div class="relative">
      <div class="app-card flex min-w-[10rem] items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left app-text">
        <div class="min-w-0 flex-1">
          <p class="app-faint text-xs uppercase tracking-[0.25em]">Online</p>
          <p class="mt-1 text-sm font-semibold app-text">${summaryLabel}</p>
        </div>
        <button
          type="button"
          class="app-theme-toggle inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          x-on:click="presenceOpen = !presenceOpen"
        >
          Info
        </button>
      </div>

      <div
        x-cloak
        x-show="presenceOpen"
        x-transition:enter="transform transition ease-out duration-150"
        x-transition:enter-start="translate-y-2 opacity-0"
        x-transition:enter-end="translate-y-0 opacity-100"
        x-transition:leave="transform transition ease-in duration-120"
        x-transition:leave-start="translate-y-0 opacity-100"
        x-transition:leave-end="translate-y-2 opacity-0"
        class="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-72 max-w-[min(18rem,calc(100vw-2rem))]"
      >
        <div class="app-panel-strong rounded-[1.25rem] p-4 backdrop-blur-xl">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="app-eyebrow text-[11px] uppercase tracking-[0.25em]">Online now</p>
              <h3 class="mt-1 text-base font-semibold app-text">${summaryLabel}</h3>
            </div>
            <span class="app-surface inline-flex size-8 items-center justify-center rounded-full text-xs app-subtext">
              ${count}
            </span>
          </div>
          ${detailsBody}
        </div>
      </div>
    </div>
  `;
};

export const renderActivityCard = (events: RoomActivityEvent[]) => {
  const listHtml =
    events.length === 0
      ? '<p class="app-muted text-sm">No room activity yet.</p>'
      : `
        <ul class="space-y-2.5">
          ${events
            .map(
              (event) => `
                <li class="app-card rounded-xl px-3 py-2.5">
                  <div class="flex items-start justify-between gap-3">
                    <p class="min-w-0 text-sm leading-5 app-subtext">
                      <span class="font-semibold" ${colorStyle(event.nicknameColor)}>${escapeHtml(event.nickname)}</span>
                      <span> ${renderActivityLabel(event)}</span>
                    </p>
                    <time class="app-faint shrink-0 text-[11px]" datetime="${event.createdAt.toISOString()}" title="${formatDateTime(event.createdAt)}">
                      ${escapeHtml(formatRelativeTime(event.createdAt))}
                    </time>
                  </div>
                </li>
              `,
            )
            .join('')}
        </ul>
      `;

  return `
    <div class="relative">
      <div class="app-card flex items-center gap-3 rounded-xl px-3 py-2.5 text-left app-text">
        <span class="app-notification-glyph inline-flex size-9 items-center justify-center rounded-full" aria-hidden="true">🔔</span>
        <button
          type="button"
          class="app-theme-toggle inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          x-on:click="activityOpen = !activityOpen"
        >
          Feed
        </button>
      </div>

      <div
        x-cloak
        x-show="activityOpen"
        x-transition:enter="transform transition ease-out duration-150"
        x-transition:enter-start="translate-y-2 opacity-0"
        x-transition:enter-end="translate-y-0 opacity-100"
        x-transition:leave="transform transition ease-in duration-120"
        x-transition:leave-start="translate-y-0 opacity-100"
        x-transition:leave-end="translate-y-2 opacity-0"
        class="fixed right-4 top-24 z-40 w-80 max-w-[min(20rem,calc(100vw-1rem))] sm:right-6 sm:top-28"
      >
        <div class="app-panel-strong rounded-[1.25rem] p-4 backdrop-blur-xl">
          <div class="mb-3">
            <p class="app-eyebrow text-[11px] uppercase tracking-[0.25em]">Room activity</p>
            <h3 class="mt-1 text-base font-semibold app-text">Latest activity</h3>
          </div>
          ${listHtml}
        </div>
      </div>
    </div>
  `;
};

export const renderTypingState = (entries: TypingEntry[]) => {
  if (entries.length === 0) {
    return '<span class="app-faint">No one is typing.</span>';
  }

  const renderName = (entry: TypingEntry) => `<span ${colorStyle(entry.nicknameColor)}>${escapeHtml(entry.nickname)}</span>`;

  if (entries.length === 1) {
    return `<span class="app-eyebrow">${renderName(entries[0])} is typing...</span>`;
  }

  if (entries.length === 2) {
    return `<span class="app-eyebrow">${renderName(entries[0])} and ${renderName(entries[1])} are typing...</span>`;
  }

  return `<span class="app-eyebrow">${renderName(entries[0])}, ${renderName(entries[1])}, and others are typing...</span>`;
};

export const renderHistoryRegion = (roomId: number, cursor: string | null) => {
  if (!cursor) {
    return `
      <div id="history-region" class="app-faint pb-4 text-center text-xs uppercase tracking-[0.2em]">
        You have reached the beginning
      </div>
    `;
  }

  return `
    <div id="history-region" class="pb-4 text-center">
      <button
        type="button"
        class="app-theme-toggle rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition"
        hx-get="/rooms/${roomId}/history?before=${cursor}"
        hx-swap="none"
        hx-on::before-request="window.liveChatRoom?.captureHistoryScroll()"
        hx-on::after-settle="window.liveChatRoom?.restoreHistoryScroll()"
      >
        Load older messages
      </button>
    </div>
  `;
};

export const renderRoomsNav = (rooms: Room[], activeRoomId: number) =>
  rooms
    .map(
      (room) => `
        <a
          href="/rooms/${room.id}"
          class="flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
            room.id === activeRoomId
              ? 'app-primary-button'
              : 'app-card app-subtext hover:border-[color:var(--border-color-strong)] hover:text-[var(--text-primary)]'
          }"
        >
          <span class="sidebar-room-initial inline-flex size-8 shrink-0 items-center justify-center rounded-full app-surface text-xs font-semibold">
            ${escapeHtml(room.name.charAt(0)?.toUpperCase() ?? '#')}
          </span>
          <span class="min-w-0 flex-1">
            <span class="sidebar-room-label block font-semibold">${escapeHtml(room.name)}</span>
            <span class="sidebar-room-description app-faint mt-1 block line-clamp-2 text-xs">${escapeHtml(room.description ?? 'No description')}</span>
          </span>
        </a>
      `,
    )
    .join('');

export const renderMentionNotification = (payload: MentionNotification) => `
  <div class="app-notification-toast rounded-[1.3rem] px-5 py-4 backdrop-blur-xl">
    <p class="app-eyebrow text-xs uppercase tracking-[0.2em]">Mentioned in ${escapeHtml(payload.roomName)}</p>
    <p class="mt-2 text-sm font-semibold leading-5">
      <span ${colorStyle(payload.senderNicknameColor)}>${escapeHtml(payload.senderNickname)}</span>
      <span class="app-text"> messaged you</span>
    </p>
    <p class="app-muted mt-1 text-sm leading-5">${normalizeMentions(payload.body)}</p>
  </div>
`;

export const renderErrorFragment = (message: string) =>
  `
    <div class="app-toast-error rounded-[1.4rem] px-5 py-4 text-sm backdrop-blur-xl">
      ${escapeHtml(message)}
    </div>
  `;
