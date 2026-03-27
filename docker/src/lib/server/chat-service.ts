import { and, asc, desc, eq, lt, or } from 'drizzle-orm';

import { db } from './db';
import { chatState, type PresenceProfile } from './chat-state';
import {
  decodeCursor,
  encodeCursor,
  renderActivityCard,
  renderMentionNotification,
  renderMessageItem,
  renderPresenceCard,
  renderRoomsNav,
  renderTypingState,
} from './render';
import { messages, roomActivityEvents, rooms, userProfiles, type Message, type Room, type RoomActivityEvent, type UserProfile } from './schema';

const DEFAULT_NICKNAME_COLOR = '#34d399';
const PAGE_SIZE = 30;
const ACTIVITY_PAGE_SIZE = 12;
const LEAVE_GRACE_MS = 8_000;
const STALE_PRESENCE_TTL_MS = 5 * 60_000;
const PRESENCE_SWEEP_MS = 15_000;
const TYPING_TTL_MS = 4_000;
const ACTIVE_NICKNAME_TTL_MS = STALE_PRESENCE_TTL_MS + LEAVE_GRACE_MS;
const ACTIVE_NICKNAME_CONFLICT_MESSAGE = 'That nickname is already in use by someone still online.';
const MENTION_PATTERN = /@(?:\[([^\]]+)\]|([a-zA-Z0-9_.-]+))/g;

const ensureRoomExists = async (roomId: number) => {
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, roomId),
  });

  if (!room) {
    throw new Error('Room not found');
  }

  return room;
};

const getProfileForBrowser = async (browserSession: string) =>
  db.query.userProfiles.findFirst({
    where: eq(userProfiles.browserSession, browserSession),
  });

const upsertProfile = async (profile: { browserSession: string; nickname: string; nicknameColor: string }) => {
  const [storedProfile] = await db
    .insert(userProfiles)
    .values({
      browserSession: profile.browserSession,
      nickname: profile.nickname,
      nicknameColor: profile.nicknameColor,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfiles.browserSession,
      set: {
        nickname: profile.nickname,
        nicknameColor: profile.nicknameColor,
        updatedAt: new Date(),
      },
    })
    .returning();

  return storedProfile;
};

const ensureProfile = async (browserSession: string, nickname: string) => {
  const existingProfile = await getProfileForBrowser(browserSession);
  if (!existingProfile) {
    return upsertProfile({
      browserSession,
      nickname,
      nicknameColor: DEFAULT_NICKNAME_COLOR,
    });
  }

  if (existingProfile.nickname === nickname) {
    return existingProfile;
  }

  return upsertProfile({
    browserSession,
    nickname,
    nicknameColor: existingProfile.nicknameColor || DEFAULT_NICKNAME_COLOR,
  });
};

const toPresenceProfile = (profile: Pick<UserProfile, 'browserSession' | 'nickname' | 'nicknameColor'>): PresenceProfile => ({
  browserId: profile.browserSession,
  nickname: profile.nickname,
  nicknameColor: profile.nicknameColor || DEFAULT_NICKNAME_COLOR,
});

const broadcastPresence = (roomId: number) => {
  const entries = chatState.listPresenceDetails(roomId);
  chatState.emit({
    roomId,
    event: 'presence',
    html: renderPresenceCard(entries),
  });
};

const broadcastTyping = (roomId: number) => {
  chatState.pruneTyping(roomId);
  chatState.emit({
    roomId,
    event: 'typing',
    html: renderTypingState(chatState.listTyping(roomId)),
  });
};

const getRoomActivityPage = async (roomId: number, limit = ACTIVITY_PAGE_SIZE) =>
  db
    .select()
    .from(roomActivityEvents)
    .where(eq(roomActivityEvents.roomId, roomId))
    .orderBy(desc(roomActivityEvents.createdAt), desc(roomActivityEvents.id))
    .limit(limit);

const broadcastActivity = async (roomId: number) => {
  const events = await getRoomActivityPage(roomId);
  chatState.emit({
    roomId,
    event: 'activity',
    html: renderActivityCard(events),
  });
};

const ensureNicknameOwner = (nickname: string, browserId: string) => {
  const { accepted } = chatState.claimNickname(nickname, browserId, ACTIVE_NICKNAME_TTL_MS);
  if (!accepted) {
    throw new Error(ACTIVE_NICKNAME_CONFLICT_MESSAGE);
  }
};

const releaseNicknameIfInactive = (nickname: string, browserId: string) => {
  if (!chatState.hasPresenceForBrowser(browserId)) {
    chatState.releaseNickname(nickname, browserId);
  }
};

const createActivityEvent = async (event: {
  roomId: number;
  browserSession: string;
  type: RoomActivityEvent['type'];
  nickname: string;
  nicknameColor: string;
  previousNickname?: string | null;
}) => {
  await db.insert(roomActivityEvents).values({
    roomId: event.roomId,
    browserSession: event.browserSession,
    type: event.type,
    nickname: event.nickname,
    nicknameColor: event.nicknameColor,
    previousNickname: event.previousNickname ?? null,
  });
};

const getLatestActivityForBrowser = async (roomId: number, browserSession: string) =>
  db
    .select()
    .from(roomActivityEvents)
    .where(and(eq(roomActivityEvents.roomId, roomId), eq(roomActivityEvents.browserSession, browserSession)))
    .orderBy(desc(roomActivityEvents.createdAt), desc(roomActivityEvents.id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

const recordJoinActivity = async (roomId: number, profile: PresenceProfile) => {
  const latestActivity = await getLatestActivityForBrowser(roomId, profile.browserId);
  const type: RoomActivityEvent['type'] = latestActivity?.type === 'left' ? 'rejoined' : 'joined';
  await createActivityEvent({
    roomId,
    browserSession: profile.browserId,
    type,
    nickname: profile.nickname,
    nicknameColor: profile.nicknameColor,
  });
};

const recordLeaveActivity = async (roomId: number, profile: PresenceProfile) => {
  await createActivityEvent({
    roomId,
    browserSession: profile.browserId,
    type: 'left',
    nickname: profile.nickname,
    nicknameColor: profile.nicknameColor,
  });
};

const finalizeRoomLeave = async (roomId: number, browserId: string) => {
  const result = chatState.finalizeLeave(roomId, browserId);
  if (!result.removed) {
    return;
  }

  broadcastTyping(roomId);
  broadcastPresence(roomId);
  await recordLeaveActivity(roomId, result.profile);
  await broadcastActivity(roomId);
  releaseNicknameIfInactive(result.profile.nickname, browserId);
};

const prunePresence = async () => {
  const removedSessions = chatState.pruneStalePresence(STALE_PRESENCE_TTL_MS);
  const dirtyRooms = new Set<number>();

  for (const removed of removedSessions) {
    dirtyRooms.add(removed.roomId);
    await recordLeaveActivity(removed.roomId, removed);
    releaseNicknameIfInactive(removed.nickname, removed.browserId);
  }

  for (const roomId of dirtyRooms) {
    broadcastTyping(roomId);
    broadcastPresence(roomId);
    await broadcastActivity(roomId);
  }
};

const startPresenceSweeper = () => {
  setInterval(() => {
    void prunePresence().catch(() => undefined);
  }, PRESENCE_SWEEP_MS);
};

export const ensureLobbyRoom = async () => {
  const existingLobby = await db.query.rooms.findFirst({
    where: eq(rooms.name, 'Lobby'),
  });

  if (existingLobby) {
    return existingLobby;
  }

  const [lobby] = await db
    .insert(rooms)
    .values({
      name: 'Lobby',
      description: 'Default room for everyone joining the chat.',
    })
    .onConflictDoNothing()
    .returning();

  if (lobby) {
    return lobby;
  }

  const fallbackLobby = await db.query.rooms.findFirst({
    where: eq(rooms.name, 'Lobby'),
  });

  if (!fallbackLobby) {
    throw new Error('Unable to initialize Lobby');
  }

  return fallbackLobby;
};

export const getRoomList = () =>
  db.select().from(rooms).orderBy(asc(rooms.name));

export const getRoomNavHtml = async (activeRoomId: number) =>
  renderRoomsNav(await getRoomList(), activeRoomId);

export const getRoomById = async (roomId: number) => ensureRoomExists(roomId);

export const reserveNickname = async (nickname: string, browserId: string) => {
  ensureNicknameOwner(nickname, browserId);
  return ensureProfile(browserId, nickname);
};

export const getProfile = async (browserId: string, nickname: string) => ensureProfile(browserId, nickname);

export const updateProfile = async (
  browserId: string,
  currentNickname: string,
  nextNickname: string,
  nextNicknameColor: string,
) => {
  await prunePresence();

  const existingProfile = await ensureProfile(browserId, currentNickname);
  if (nextNickname !== currentNickname) {
    ensureNicknameOwner(nextNickname, browserId);
  } else {
    ensureNicknameOwner(currentNickname, browserId);
  }

  const storedProfile = await upsertProfile({
    browserSession: browserId,
    nickname: nextNickname,
    nicknameColor: nextNicknameColor,
  });

  const affectedRoomIds = chatState.updateProfile(
    browserId,
    {
      nickname: storedProfile.nickname,
      nicknameColor: storedProfile.nicknameColor,
    },
  );

  if (nextNickname !== currentNickname) {
    chatState.releaseNickname(currentNickname, browserId);
  }

  for (const roomId of affectedRoomIds) {
    if (nextNickname !== currentNickname) {
      await createActivityEvent({
        roomId,
        browserSession: browserId,
        type: 'nickname_changed',
        nickname: storedProfile.nickname,
        nicknameColor: storedProfile.nicknameColor,
        previousNickname: existingProfile.nickname,
      });
    }

    broadcastPresence(roomId);
    broadcastTyping(roomId);
    await broadcastActivity(roomId);
  }

  releaseNicknameIfInactive(currentNickname, browserId);
  return storedProfile;
};

export const getMessagePage = async (roomId: number, cursor?: string | null) => {
  await ensureRoomExists(roomId);

  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  const filters = [eq(messages.roomId, roomId)];
  filters.push(eq(messages.type, 'user'));

  if (decodedCursor) {
    filters.push(
      or(
        lt(messages.createdAt, decodedCursor.createdAt),
        and(eq(messages.createdAt, decodedCursor.createdAt), lt(messages.id, decodedCursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...filters))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const visibleRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const orderedRows = [...visibleRows].reverse();
  const nextCursor = hasMore && orderedRows[0] ? encodeCursor(orderedRows[0]) : null;

  return {
    messages: orderedRows,
    nextCursor,
  };
};

export const getMentionCandidates = async (roomId: number, query: string, excludeBrowserId: string) => {
  await prunePresence();
  const normalizedQuery = query.trim().toLowerCase();
  return chatState
    .listRoomMembers(roomId)
    .filter((member) => member.browserId !== excludeBrowserId)
    .filter((member) => normalizedQuery.length === 0 || member.nickname.toLowerCase().includes(normalizedQuery))
    .map((member) => member.nickname)
    .sort((left, right) => left.localeCompare(right));
};

export const postMessage = async (roomId: number, browserId: string, nickname: string, body: string) => {
  const [room, profile] = await Promise.all([
    ensureRoomExists(roomId),
    ensureProfile(browserId, nickname),
  ]);

  const [message] = await db
    .insert(messages)
    .values({
      roomId,
      nickname: profile.nickname,
      nicknameColor: profile.nicknameColor,
      body,
      type: 'user',
    })
    .returning();

  chatState.emit({
    roomId,
    event: 'message',
    html: renderMessageItem(message),
  });

  const roomMembers = chatState.listRoomMembers(roomId);
  const membersByNickname = new Map(roomMembers.map((member) => [member.nickname, member]));
  const mentionedBrowserIds = new Set<string>();

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const target = (match[1] ?? match[2] ?? '').trim();
    if (!target) {
      continue;
    }

    if (target === 'everyone') {
      for (const member of roomMembers) {
        mentionedBrowserIds.add(member.browserId);
      }
      continue;
    }

    const member = membersByNickname.get(target);
    if (!member || member.browserId === browserId) {
      continue;
    }

    mentionedBrowserIds.add(member.browserId);
  }

  for (const targetBrowserId of mentionedBrowserIds) {
    chatState.emitNotification(
      targetBrowserId,
      renderMentionNotification({
        senderNickname: profile.nickname,
        senderNicknameColor: profile.nicknameColor,
        roomId: room.id,
        roomName: room.name,
        body,
      }),
    );
  }
};

export const createRoom = async (name: string, description?: string) => {
  const [room] = await db
    .insert(rooms)
    .values({
      name,
      description,
    })
    .returning();

  chatState.emitRooms();
  return room;
};

export const joinRoomPresence = async (roomId: number, nickname: string, browserId: string, tabId: string) => {
  await ensureRoomExists(roomId);
  await prunePresence();

  const profile = await ensureProfile(browserId, nickname);
  ensureNicknameOwner(profile.nickname, browserId);
  chatState.cancelPendingLeave(roomId, browserId);

  const presenceProfile = toPresenceProfile(profile);
  const { joinedBrowser } = chatState.touchPresence(roomId, presenceProfile, tabId);
  chatState.clearTyping(roomId, browserId, tabId);
  broadcastTyping(roomId);

  if (joinedBrowser) {
    broadcastPresence(roomId);
    await recordJoinActivity(roomId, presenceProfile);
    await broadcastActivity(roomId);
  }
};

export const leaveRoomPresence = async (roomId: number, nickname: string, browserId: string, tabId: string) => {
  await ensureRoomExists(roomId);
  if (!chatState.touchNicknameOwner(nickname, browserId)) {
    return;
  }

  const { scheduleLeave } = chatState.markLeaving(roomId, browserId, tabId);
  chatState.clearTyping(roomId, browserId, tabId);
  broadcastTyping(roomId);
  if (!scheduleLeave) {
    return;
  }

  chatState.schedulePendingLeave(roomId, browserId, LEAVE_GRACE_MS, () => {
    void finalizeRoomLeave(roomId, browserId);
  });
};

export const refreshTyping = async (roomId: number, nickname: string, browserId: string, tabId: string) => {
  await ensureRoomExists(roomId);
  await prunePresence();

  const profile = await ensureProfile(browserId, nickname);
  ensureNicknameOwner(profile.nickname, browserId);
  chatState.cancelPendingLeave(roomId, browserId);

  const presenceProfile = toPresenceProfile(profile);
  const { joinedBrowser } = chatState.touchPresence(roomId, presenceProfile, tabId);
  chatState.touchTyping(roomId, presenceProfile, tabId, TYPING_TTL_MS);
  if (joinedBrowser) {
    broadcastPresence(roomId);
    await recordJoinActivity(roomId, presenceProfile);
    await broadcastActivity(roomId);
  }
  broadcastTyping(roomId);
};

export const stopTyping = async (roomId: number, browserId: string, tabId: string) => {
  chatState.clearTyping(roomId, browserId, tabId);
  broadcastTyping(roomId);
};

export const getPresenceHtml = async (roomId: number) => {
  await prunePresence();
  return renderPresenceCard(chatState.listPresenceDetails(roomId));
};

export const getTypingHtml = (roomId: number) => {
  chatState.pruneTyping(roomId);
  return renderTypingState(chatState.listTyping(roomId));
};

export const getActivityHtml = async (roomId: number) => {
  await ensureRoomExists(roomId);
  return renderActivityCard(await getRoomActivityPage(roomId));
};

export const subscribeToRoom = (roomId: number, listener: (payload: { event: 'message' | 'presence' | 'typing' | 'activity'; html: string }) => void) =>
  chatState.subscribe(roomId, listener);

export const subscribeToRoomList = (listener: () => void) =>
  chatState.subscribeToRooms(listener);

export const subscribeToNotifications = (browserId: string, listener: (html: string) => void) =>
  chatState.subscribeToNotifications(browserId, listener);

export const getLatestRoomState = async (roomId: number) => {
  await ensureRoomExists(roomId);
  return {
    presenceHtml: await getPresenceHtml(roomId),
    typingHtml: getTypingHtml(roomId),
    activityHtml: await getActivityHtml(roomId),
  };
};

export const isRoomDuplicateError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: string }).code === 'string' &&
  (error as { code?: string }).code === '23505';

export const getNewestMessage = async (roomId: number) => {
  await ensureRoomExists(roomId);

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  return message ?? null;
};

export type ChatMessage = Message;
export type ChatRoom = Room;

declare global {
  // eslint-disable-next-line no-var
  var __liveChatPresenceSweepStarted: boolean | undefined;
}

if (!globalThis.__liveChatPresenceSweepStarted) {
  startPresenceSweeper();
  globalThis.__liveChatPresenceSweepStarted = true;
}
