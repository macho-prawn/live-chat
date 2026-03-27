import { EventEmitter } from 'node:events';

type RoomEventName = 'message' | 'presence' | 'typing' | 'activity';

export type RoomEventPayload = {
  roomId: number;
  event: RoomEventName;
  html: string;
};

type NicknameOwner = {
  browserId: string;
  lastSeenAt: number;
};

export type PresenceProfile = {
  browserId: string;
  nickname: string;
  nicknameColor: string;
};

type PresenceSession = PresenceProfile & {
  joinedAt: number;
  lastSeenAt: number;
  tabIds: Set<string>;
};

type TypingSession = PresenceProfile & {
  expiresAt: number;
};

type RoomPresence = Map<string, PresenceSession>;
type RoomTyping = Map<string, Map<string, TypingSession>>;

type StalePresenceSession = PresenceProfile & {
  roomId: number;
};

export type PresenceEntry = PresenceProfile & {
  joinedAt: Date;
};

export type TypingEntry = PresenceProfile;

export type MentionNotification = {
  senderNickname: string;
  senderNicknameColor: string;
  roomId: number;
  roomName: string;
  body: string;
};

class ChatState {
  private readonly emitter = new EventEmitter();

  private readonly presence = new Map<number, RoomPresence>();

  private readonly typing = new Map<number, RoomTyping>();

  private readonly nicknameOwners = new Map<string, NicknameOwner>();

  private readonly pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

  private leaveKey(roomId: number, browserId: string) {
    return `${roomId}:${browserId}`;
  }

  emit(payload: RoomEventPayload) {
    this.emitter.emit(`room:${payload.roomId}`, payload);
  }

  emitRooms() {
    this.emitter.emit('rooms');
  }

  emitNotification(browserId: string, payload: string) {
    this.emitter.emit(`notify:${browserId}`, payload);
  }

  subscribe(roomId: number, listener: (payload: RoomEventPayload) => void) {
    const eventName = `room:${roomId}`;
    this.emitter.on(eventName, listener);
    return () => {
      this.emitter.off(eventName, listener);
    };
  }

  subscribeToRooms(listener: () => void) {
    this.emitter.on('rooms', listener);
    return () => {
      this.emitter.off('rooms', listener);
    };
  }

  subscribeToNotifications(browserId: string, listener: (payload: string) => void) {
    const eventName = `notify:${browserId}`;
    this.emitter.on(eventName, listener);
    return () => {
      this.emitter.off(eventName, listener);
    };
  }

  claimNickname(nickname: string, browserId: string, maxAgeMs: number, now = Date.now()) {
    this.pruneNicknameOwners(maxAgeMs, now);

    const owner = this.nicknameOwners.get(nickname);
    if (owner && owner.browserId !== browserId) {
      return { accepted: false };
    }

    this.nicknameOwners.set(nickname, {
      browserId,
      lastSeenAt: now,
    });

    return { accepted: true };
  }

  touchNicknameOwner(nickname: string, browserId: string, now = Date.now()) {
    const owner = this.nicknameOwners.get(nickname);
    if (owner && owner.browserId !== browserId) {
      return false;
    }

    this.nicknameOwners.set(nickname, {
      browserId,
      lastSeenAt: now,
    });

    return true;
  }

  releaseNickname(nickname: string, browserId: string) {
    const owner = this.nicknameOwners.get(nickname);
    if (owner?.browserId === browserId) {
      this.nicknameOwners.delete(nickname);
    }
  }

  touchPresence(roomId: number, profile: PresenceProfile, tabId: string, now = Date.now()) {
    const roomPresence = this.presence.get(roomId) ?? new Map<string, PresenceSession>();
    const session = roomPresence.get(profile.browserId);
    const joinedBrowser = !session;
    const nextSession: PresenceSession = session ?? {
      ...profile,
      joinedAt: now,
      lastSeenAt: now,
      tabIds: new Set<string>(),
    };

    nextSession.nickname = profile.nickname;
    nextSession.nicknameColor = profile.nicknameColor;
    nextSession.lastSeenAt = now;
    nextSession.tabIds.add(tabId);

    roomPresence.set(profile.browserId, nextSession);
    this.presence.set(roomId, roomPresence);
    this.touchNicknameOwner(profile.nickname, profile.browserId, now);

    return {
      joinedBrowser,
    };
  }

  markLeaving(roomId: number, browserId: string, tabId: string, now = Date.now()) {
    const roomPresence = this.presence.get(roomId);
    if (!roomPresence) {
      return { scheduleLeave: false };
    }

    const session = roomPresence.get(browserId);
    if (!session) {
      return { scheduleLeave: false };
    }

    session.lastSeenAt = now;
    session.tabIds.delete(tabId);

    return {
      scheduleLeave: session.tabIds.size === 0,
    };
  }

  finalizeLeave(roomId: number, browserId: string) {
    const roomPresence = this.presence.get(roomId);
    if (!roomPresence) {
      return { removed: false as const };
    }

    const session = roomPresence.get(browserId);
    if (!session || session.tabIds.size > 0) {
      return { removed: false as const };
    }

    roomPresence.delete(browserId);
    this.cancelPendingLeave(roomId, browserId);
    this.clearTypingBrowser(roomId, browserId);

    if (roomPresence.size === 0) {
      this.presence.delete(roomId);
    }

    return {
      removed: true as const,
      profile: {
        browserId,
        nickname: session.nickname,
        nicknameColor: session.nicknameColor,
      },
    };
  }

  pruneStalePresence(maxAgeMs: number, now = Date.now()) {
    const removed: StalePresenceSession[] = [];

    for (const [roomId, roomPresence] of this.presence.entries()) {
      for (const [browserId, session] of roomPresence.entries()) {
        if (now - session.lastSeenAt <= maxAgeMs) {
          continue;
        }

        roomPresence.delete(browserId);
        this.cancelPendingLeave(roomId, browserId);
        this.clearTypingBrowser(roomId, browserId);
        removed.push({
          roomId,
          browserId,
          nickname: session.nickname,
          nicknameColor: session.nicknameColor,
        });
      }

      if (roomPresence.size === 0) {
        this.presence.delete(roomId);
      }
    }

    this.pruneNicknameOwners(maxAgeMs, now);
    return removed;
  }

  listPresenceDetails(roomId: number): PresenceEntry[] {
    const roomPresence = this.presence.get(roomId);
    if (!roomPresence) {
      return [];
    }

    return Array.from(roomPresence.values())
      .map((session) => ({
        browserId: session.browserId,
        nickname: session.nickname,
        nicknameColor: session.nicknameColor,
        joinedAt: new Date(session.joinedAt),
      }))
      .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime() || left.nickname.localeCompare(right.nickname));
  }

  listRoomMembers(roomId: number) {
    const roomPresence = this.presence.get(roomId);
    if (!roomPresence) {
      return [];
    }

    return Array.from(roomPresence.values()).map((session) => ({
      browserId: session.browserId,
      nickname: session.nickname,
      nicknameColor: session.nicknameColor,
    }));
  }

  listActiveNicknames(maxAgeMs: number, now = Date.now()) {
    this.pruneNicknameOwners(maxAgeMs, now);
    return Array.from(this.nicknameOwners.keys()).sort((left, right) => left.localeCompare(right));
  }

  hasPresenceForBrowser(browserId: string) {
    for (const roomPresence of this.presence.values()) {
      if (roomPresence.has(browserId)) {
        return true;
      }
    }

    return false;
  }

  listActiveRoomIds(browserId: string) {
    const roomIds: number[] = [];

    for (const [roomId, roomPresence] of this.presence.entries()) {
      if (roomPresence.has(browserId)) {
        roomIds.push(roomId);
      }
    }

    return roomIds;
  }

  updateProfile(browserId: string, profile: Omit<PresenceProfile, 'browserId'>, now = Date.now()) {
    const affectedRoomIds = new Set<number>();

    for (const [roomId, roomPresence] of this.presence.entries()) {
      const session = roomPresence.get(browserId);
      if (!session) {
        continue;
      }

      session.nickname = profile.nickname;
      session.nicknameColor = profile.nicknameColor;
      session.lastSeenAt = now;
      affectedRoomIds.add(roomId);
    }

    for (const [roomId, roomTyping] of this.typing.entries()) {
      const sessions = roomTyping.get(browserId);
      if (!sessions) {
        continue;
      }

      for (const session of sessions.values()) {
        session.nickname = profile.nickname;
        session.nicknameColor = profile.nicknameColor;
      }

      affectedRoomIds.add(roomId);
    }

    this.touchNicknameOwner(profile.nickname, browserId, now);
    return Array.from(affectedRoomIds);
  }

  cancelPendingLeave(roomId: number, browserId: string) {
    const key = this.leaveKey(roomId, browserId);
    const timer = this.pendingLeaves.get(key);
    if (timer) {
      clearTimeout(timer);
      this.pendingLeaves.delete(key);
    }
  }

  schedulePendingLeave(roomId: number, browserId: string, delayMs: number, callback: () => void) {
    const key = this.leaveKey(roomId, browserId);
    this.cancelPendingLeave(roomId, browserId);

    const timer = setTimeout(() => {
      this.pendingLeaves.delete(key);
      callback();
    }, delayMs);

    this.pendingLeaves.set(key, timer);
  }

  touchTyping(roomId: number, profile: PresenceProfile, tabId: string, ttlMs: number, now = Date.now()) {
    const roomTyping = this.typing.get(roomId) ?? new Map<string, Map<string, TypingSession>>();
    const sessions = roomTyping.get(profile.browserId) ?? new Map<string, TypingSession>();

    sessions.set(tabId, {
      ...profile,
      expiresAt: now + ttlMs,
    });

    roomTyping.set(profile.browserId, sessions);
    this.typing.set(roomId, roomTyping);
  }

  clearTyping(roomId: number, browserId: string, tabId: string) {
    const roomTyping = this.typing.get(roomId);
    if (!roomTyping) {
      return;
    }

    const sessions = roomTyping.get(browserId);
    if (!sessions) {
      return;
    }

    sessions.delete(tabId);
    if (sessions.size === 0) {
      roomTyping.delete(browserId);
    }

    if (roomTyping.size === 0) {
      this.typing.delete(roomId);
    }
  }

  clearTypingBrowser(roomId: number, browserId: string) {
    const roomTyping = this.typing.get(roomId);
    if (!roomTyping) {
      return;
    }

    roomTyping.delete(browserId);
    if (roomTyping.size === 0) {
      this.typing.delete(roomId);
    }
  }

  pruneTyping(roomId: number, now = Date.now()) {
    const roomTyping = this.typing.get(roomId);
    if (!roomTyping) {
      return;
    }

    for (const [browserId, sessions] of roomTyping.entries()) {
      for (const [tabId, session] of sessions.entries()) {
        if (session.expiresAt <= now) {
          sessions.delete(tabId);
        }
      }

      if (sessions.size === 0) {
        roomTyping.delete(browserId);
      }
    }

    if (roomTyping.size === 0) {
      this.typing.delete(roomId);
    }
  }

  listTyping(roomId: number): TypingEntry[] {
    const roomTyping = this.typing.get(roomId);
    if (!roomTyping) {
      return [];
    }

    return Array.from(roomTyping.entries())
      .map(([browserId, sessions]) => {
        const session = Array.from(sessions.values())[0];
        if (!session) {
          return null;
        }

        return {
          browserId,
          nickname: session.nickname,
          nicknameColor: session.nicknameColor,
        };
      })
      .filter((entry): entry is TypingEntry => entry !== null)
      .sort((left, right) => left.nickname.localeCompare(right.nickname));
  }

  private pruneNicknameOwners(maxAgeMs: number, now = Date.now()) {
    for (const [nickname, owner] of this.nicknameOwners.entries()) {
      if (now - owner.lastSeenAt <= maxAgeMs) {
        continue;
      }

      if (!this.hasPresenceForBrowser(owner.browserId)) {
        this.nicknameOwners.delete(nickname);
      }
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __liveChatState: ChatState | undefined;
}

export const chatState = globalThis.__liveChatState ?? new ChatState();

if (!globalThis.__liveChatState) {
  globalThis.__liveChatState = chatState;
}
