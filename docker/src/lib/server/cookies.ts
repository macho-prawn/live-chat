import { randomUUID } from 'node:crypto';
import type { APIContext, AstroCookies } from 'astro';

import { env } from './env';

const browserSessionCookieName = 'live_chat_browser_session';

const cookieOptions = {
  path: '/',
  httpOnly: false,
  sameSite: 'lax' as const,
  secure: false,
};

const getCookieValue = (cookies: AstroCookies, name: string) => cookies.get(name)?.value?.trim() ?? '';

export const getBrowserSession = (cookies: AstroCookies) => getCookieValue(cookies, browserSessionCookieName);

const clearCookie = (cookies: AstroCookies, name: string) => {
  cookies.delete(name, { path: cookieOptions.path });
};

export const clearNicknameCookie = (cookies: AstroCookies) => {
  clearCookie(cookies, env.nicknameCookieName);
};

export const clearBrowserSessionCookie = (cookies: AstroCookies) => {
  clearCookie(cookies, browserSessionCookieName);
};

export const clearSessionCookies = (cookies: AstroCookies) => {
  clearNicknameCookie(cookies);
  clearBrowserSessionCookie(cookies);
};

export const getNickname = (cookies: AstroCookies) => {
  const browserSession = getBrowserSession(cookies);
  const nickname = getCookieValue(cookies, env.nicknameCookieName);

  if (!browserSession && nickname) {
    clearNicknameCookie(cookies);
    return '';
  }

  return nickname;
};

export const requireNickname = (context: Pick<APIContext, 'cookies'>) => {
  const nickname = getNickname(context.cookies);
  return nickname.length > 0 ? nickname : null;
};

export const requireBrowserSession = (context: Pick<APIContext, 'cookies'>) => {
  const browserSession = getBrowserSession(context.cookies);

  if (!browserSession && getCookieValue(context.cookies, env.nicknameCookieName)) {
    clearSessionCookies(context.cookies);
  }

  return browserSession.length > 0 ? browserSession : null;
};

export const getOrCreateBrowserSession = (cookies: AstroCookies) => {
  const existing = getBrowserSession(cookies);
  if (existing) {
    return existing;
  }

  const browserSession = randomUUID();
  cookies.set(browserSessionCookieName, browserSession, cookieOptions);
  return browserSession;
};

export const setNicknameCookie = (cookies: AstroCookies, nickname: string) => {
  cookies.set(env.nicknameCookieName, nickname, cookieOptions);
};
