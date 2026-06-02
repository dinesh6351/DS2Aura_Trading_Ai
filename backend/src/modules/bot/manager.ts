import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { acquireLock, releaseLock } from '../../lib/redis.js';
import { isBanned } from '../binance/binance.client.js';
import { tickUser } from './engine.js';
import { realtime } from '../notifications/realtime.js';
import { sendUserTelegram } from '../notifications/telegram.service.js';

/**
 * Multi-tenant scheduler. Replaces the original single-process cron loop: instead
 * of one bot, it fans out ticks across EVERY user whose bot is RUNNING.
 *
 * Scaling story (see docs/01-system-architecture.md):
 *  - 10–100 users: this single worker loop is plenty.
 *  - 100–1k users: shard by `userId % N` across N worker replicas.
 *  - 1k–10k users: move ticks onto a job queue (BullMQ/Redis); each tick is an
 *    independent job, workers scale horizontally. The per-user lock below already
 *    makes ticks idempotent across workers.
 */

const TICK_INTERVAL_MS = 60_000;       // evaluate every 60s (matches LIVE mode)
const PER_USER_LOCK_MS = 55_000;       // lock TTL < interval so a crash self-heals
const CONCURRENCY = 10;                // max users ticked in parallel per sweep

let timer: NodeJS.Timeout | null = null;
let running = false;

export const botManager = {
  start() {
    if (timer) return;
    logger.info('Bot manager started');
    timer = setInterval(() => void sweep(), TICK_INTERVAL_MS);
    void sweep();
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
};

async function sweep() {
  if (running) return;            // never overlap sweeps
  if (isBanned()) { logger.warn('Binance ban active — skipping sweep'); return; }
  running = true;
  try {
    // RUNNING bots trade + are watchdogged; PAUSED bots are still ticked so the
    // watchdog keeps protecting any open positions (e.g. after the daily-limit pause).
    const users = await prisma.botConfig.findMany({
      where: { status: { in: ['RUNNING', 'PAUSED'] } }, select: { userId: true },
    });
    logger.debug({ count: users.length }, 'sweep: running bots');

    // simple concurrency-limited fan-out
    for (let i = 0; i < users.length; i += CONCURRENCY) {
      const batch = users.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((u) => tickOne(u.userId)));
    }
  } catch (e) {
    logger.error({ e }, 'sweep failed');
  } finally {
    running = false;
  }
}

async function tickOne(userId: string) {
  const lockKey = `bot:lock:${userId}`;
  const got = await acquireLock(lockKey, PER_USER_LOCK_MS);
  if (!got) return; // another worker owns this user's tick
  try {
    await tickUser(userId);
  } catch (e) {
    logger.error({ userId, e }, 'tickUser failed');
  } finally {
    await releaseLock(lockKey);
  }
}

/** Reset daily counters at UTC midnight (call from a cron job). */
/**
 * New trading day: zero the per-day trade counters, reset loss streaks, and
 * auto-RESUME any bot that was paused by the consecutive-loss protector
 * (Section 6 — "resume automatically next trading day"). Manual stops/pauses are
 * left untouched.
 */
export async function resetDailyCounters() {
  await prisma.botConfig.updateMany({ data: { tradesToday: 0, consecutiveLosses: 0 } });

  const lossPaused = await prisma.botConfig.findMany({
    where: { status: 'ERROR', pausedReason: { contains: 'consecutive losses' } },
    select: { userId: true },
  });
  for (const c of lossPaused) {
    await prisma.botConfig.update({
      where: { userId: c.userId }, data: { status: 'RUNNING', pausedReason: null, consecutiveLosses: 0 },
    });
    const title = '▶ Bot resumed';
    const body = 'New trading day — consecutive-loss protection reset. Auto-trading resumed.';
    await prisma.notification.create({ data: { userId: c.userId, title, body } }).catch(() => {});
    realtime.publish(`user:${c.userId}:botlog`, { title, body, at: Date.now() });
    void sendUserTelegram(c.userId, `<b>${title}</b>\n${body}`);
  }
  logger.info({ resumed: lossPaused.length }, 'daily trade counters reset');
}
