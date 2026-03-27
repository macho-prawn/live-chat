import { bigint, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable(
  'messages',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    nickname: varchar('nickname', { length: 32 }).notNull(),
    nicknameColor: varchar('nickname_color', { length: 7 }).notNull().default('#34d399'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    type: varchar('type', { length: 16 }).$type<'user' | 'system'>().notNull(),
  },
  (table) => ({
    roomCreatedIdx: index('messages_room_created_idx').on(table.roomId, table.createdAt, table.id),
  }),
);

export const userProfiles = pgTable('user_profiles', {
  browserSession: varchar('browser_session', { length: 128 }).primaryKey(),
  nickname: varchar('nickname', { length: 32 }).notNull(),
  nicknameColor: varchar('nickname_color', { length: 7 }).notNull().default('#34d399'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roomActivityEvents = pgTable(
  'room_activity_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    browserSession: varchar('browser_session', { length: 128 }).notNull(),
    type: varchar('type', { length: 24 }).$type<'joined' | 'left' | 'rejoined' | 'nickname_changed'>().notNull(),
    nickname: varchar('nickname', { length: 32 }).notNull(),
    nicknameColor: varchar('nickname_color', { length: 7 }).notNull(),
    previousNickname: varchar('previous_nickname', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roomCreatedIdx: index('room_activity_events_room_created_idx').on(table.roomId, table.createdAt, table.id),
    browserCreatedIdx: index('room_activity_events_browser_created_idx').on(table.browserSession, table.createdAt, table.id),
  }),
);

export type Room = typeof rooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type RoomActivityEvent = typeof roomActivityEvents.$inferSelect;
