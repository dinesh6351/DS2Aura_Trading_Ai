import { prisma } from '../../lib/prisma.js';
import { encryptSecret, decryptSecret, maskKey } from '../../lib/crypto.js';
import { BinanceClient, type BinanceCreds } from '../binance/binance.client.js';
import { Errors } from '../../lib/http.js';

/**
 * Stores each tenant's Binance keys ENCRYPTED (AES-256-GCM) and hands decrypted
 * creds only to the bot engine at tick time. Plaintext keys never leave this
 * module and are never logged or returned to the client.
 */
export const apiKeyService = {
  async upsert(userId: string, apiKey: string, secret: string, label = 'default') {
    // Validate against Binance BEFORE persisting.
    const probe = new BinanceClient({ apiKey, secret });
    let perms: { canTrade: boolean; canWithdraw: boolean };
    try {
      perms = await probe.validate();
    } catch (e) {
      throw Errors.badRequest('Could not validate Binance key (check key, secret, and Futures permission)', String(e));
    }
    if (!perms.canTrade) throw Errors.badRequest('This key cannot trade futures. Enable "Futures" permission.');

    const k = encryptSecret(apiKey);
    const s = encryptSecret(secret);
    const row = await prisma.apiKey.upsert({
      where: { userId_exchange_label: { userId, exchange: 'BINANCE_FUTURES', label } },
      create: {
        userId, label,
        apiKeyCipher: k.cipher, apiKeyIv: k.iv, apiKeyTag: k.tag,
        secretCipher: s.cipher, secretIv: s.iv, secretTag: s.tag,
        status: 'VALID', canTrade: perms.canTrade, canWithdraw: perms.canWithdraw,
        lastValidatedAt: new Date(),
      },
      update: {
        apiKeyCipher: k.cipher, apiKeyIv: k.iv, apiKeyTag: k.tag,
        secretCipher: s.cipher, secretIv: s.iv, secretTag: s.tag,
        status: 'VALID', canTrade: perms.canTrade, canWithdraw: perms.canWithdraw,
        lastValidatedAt: new Date(), lastError: null,
      },
    });
    await prisma.auditLog.create({ data: { userId, action: 'API_KEY_ADDED', metadata: { label, masked: maskKey(apiKey) } } });
    // SECURITY: warn loudly if withdrawals are enabled (a key should be trade-only).
    return { id: row.id, status: row.status, canTrade: row.canTrade, canWithdraw: row.canWithdraw,
      warning: perms.canWithdraw ? 'This API key has WITHDRAWAL permission enabled. Disable it on Binance — the bot never needs it.' : undefined };
  },

  /** Internal-only: decrypt this user's creds for the engine. */
  async getDecryptedCreds(userId: string, label = 'default'): Promise<BinanceCreds> {
    const row = await prisma.apiKey.findUnique({
      where: { userId_exchange_label: { userId, exchange: 'BINANCE_FUTURES', label } },
    });
    if (!row || row.status === 'REVOKED') throw Errors.notFound('No Binance key on file');
    return {
      apiKey: decryptSecret({ cipher: row.apiKeyCipher, iv: row.apiKeyIv, tag: row.apiKeyTag }),
      secret: decryptSecret({ cipher: row.secretCipher, iv: row.secretIv, tag: row.secretTag }),
    };
  },

  /** Client-safe view: never includes ciphertext/plaintext. */
  async getPublic(userId: string) {
    const rows = await prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({
      id: r.id, label: r.label, status: r.status, canTrade: r.canTrade,
      canWithdraw: r.canWithdraw, lastValidatedAt: r.lastValidatedAt,
    }));
  },

  /** Live connectivity test: decrypt creds, hit Binance, return balance + perms. */
  async testConnection(userId: string) {
    const creds = await this.getDecryptedCreds(userId);
    const client = new BinanceClient(creds);
    const [perms, balance] = await Promise.all([client.validate(), client.getBalance()]);
    await prisma.apiKey.updateMany({
      where: { userId, exchange: 'BINANCE_FUTURES' },
      data: { lastValidatedAt: new Date(), canTrade: perms.canTrade, canWithdraw: perms.canWithdraw, lastError: null },
    });
    return {
      connected: true, canTrade: perms.canTrade, canWithdraw: perms.canWithdraw,
      totalBalance: balance.totalUsdt, availableBalance: balance.availableUsdt,
      warning: perms.canWithdraw ? 'This key has WITHDRAWAL permission — disable it on Binance.' : undefined,
    };
  },

  async revoke(userId: string, id: string) {
    const row = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!row) throw Errors.notFound('Key not found');
    await prisma.apiKey.update({ where: { id }, data: { status: 'REVOKED' } });
    await prisma.botConfig.updateMany({ where: { userId }, data: { status: 'STOPPED', pausedReason: 'API key revoked' } });
    await prisma.auditLog.create({ data: { userId, action: 'API_KEY_REVOKED', metadata: { id } } });
  },
};
