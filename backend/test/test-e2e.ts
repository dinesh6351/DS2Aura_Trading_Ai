import assert from 'assert';
import { prisma } from '../src/lib/prisma.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { tradingService } from '../src/modules/trading/trading.service.js';

async function runE2ETests() {
  console.log('🚀 Starting E2E Integration Test for Paper Trading Balance...');

  const uniqueSuffix = Math.random().toString(36).substring(2, 8);
  const testEmail = `test-e2e-${uniqueSuffix}@platform.local`;
  const testPassword = 'TestPassword!2026';
  const testName = 'E2E Test User';

  let testUserId: string | null = null;

  try {
    // 1. Register test user (creates Profile, Subscription, Wallet, BotConfig, Watchlist, TradingAccount)
    console.log(`\n1. Registering test user: ${testEmail}...`);
    const regResult = await authService.register(
      {
        email: testEmail,
        password: testPassword,
        fullName: testName,
      },
      {
        ip: '127.0.0.1',
        userAgent: 'E2E-Test-Runner',
      }
    );

    const user = regResult.user;
    testUserId = user.id;
    console.log(`✅ User registered successfully. ID: ${testUserId}`);

    // Activate the user status to bypass pending OTP verification state
    await prisma.user.update({
      where: { id: testUserId },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    console.log('✅ User account status set to ACTIVE.');

    // 2. Verify initial paper balance is exactly $100.00
    console.log('\n2. Verifying initial paper balance...');
    let account = await tradingService.account(testUserId);
    console.log(`📊 Initial stats:
       Total Balance: $${account.totalBalance}
       Available Balance: $${account.availableBalance}
       Margin Used: $${account.marginUsed}
       Unrealized P&L: $${account.unrealizedPnl}
       Positions Count: ${account.openPositions}`);

    assert.strictEqual(Number(account.totalBalance), 100.00, 'Initial totalBalance should be $100.00');
    assert.strictEqual(Number(account.availableBalance), 100.00, 'Initial availableBalance should be $100.00');
    assert.strictEqual(Number(account.marginUsed), 0.00, 'Initial marginUsed should be $0.00');
    assert.strictEqual(Number(account.unrealizedPnl), 0.00, 'Initial unrealizedPnl should be $0.00');
    assert.strictEqual(account.openPositions, 0, 'Initial openPositions count should be 0');
    console.log('✅ Initial balance verification passed.');

    // Ensure paper trading is enabled (should be default for new users)
    const botConfig = await prisma.botConfig.findUniqueOrThrow({ where: { userId: testUserId } });
    assert.strictEqual(botConfig.paperTrading, true, 'paperTrading config should be enabled by default');

    // 3. Simulate opening a LONG position (BTCUSDT entry: $60,000, size: 0.001 BTC, margin: $6.00, leverage: 10x)
    console.log('\n3. Simulating entry of a LONG BTCUSDT position at $60,000...');
    const pos = await prisma.position.create({
      data: {
        userId: testUserId,
        symbol: 'BTCUSDT',
        side: 'LONG',
        status: 'OPEN',
        entryPrice: 60000.00,
        markPrice: 60000.00,
        quantity: 0.001,
        leverage: 10,
        marginUsd: 6.00,
        unrealizedPnl: 0.00,
        entryScore: 90,
        entryBias: 'long',
      },
    });

    console.log(`✅ Position opened. ID: ${pos.id}`);

    // Re-verify balance with the open position (availableBalance should be reduced by margin used)
    account = await tradingService.account(testUserId);
    console.log(`📊 Stats with open position:
       Total Balance: $${account.totalBalance}
       Available Balance: $${account.availableBalance}
       Margin Used: $${account.marginUsed}
       Unrealized P&L: $${account.unrealizedPnl}`);

    assert.strictEqual(Number(account.totalBalance), 100.00, 'totalBalance (equity) should remain $100.00');
    assert.strictEqual(Number(account.marginUsed), 6.00, 'marginUsed should be $6.00');
    assert.strictEqual(Number(account.availableBalance), 94.00, 'availableBalance should be $94.00 ($100.00 - $6.00 margin)');
    assert.strictEqual(Number(account.unrealizedPnl), 0.00, 'unrealizedPnl should be $0.00');
    assert.strictEqual(account.openPositions, 1, 'openPositions count should be 1');
    console.log('✅ Open position stats verification passed.');

    // 4. Simulate positive price movement (BTCUSDT mark: $70,000) -> should show +$10.00 unrealized P&L
    console.log('\n4. Simulating positive price movement to $70,000 (+16.67% price, +$10.00 P&L)...');
    await prisma.position.update({
      where: { id: pos.id },
      data: { markPrice: 70000.00 },
    });

    account = await tradingService.account(testUserId);
    console.log(`📊 Stats with profit:
       Total Balance: $${account.totalBalance}
       Available Balance: $${account.availableBalance}
       Margin Used: $${account.marginUsed}
       Unrealized P&L: $${account.unrealizedPnl}`);

    assert.strictEqual(Number(account.unrealizedPnl), 10.00, 'unrealizedPnl should be +$10.00');
    assert.strictEqual(Number(account.totalBalance), 110.00, 'totalBalance (equity) should be $110.00 ($100.00 + $10.00 profit)');
    assert.strictEqual(Number(account.availableBalance), 94.00, 'availableBalance should remain $94.00 (unrealized P&L is not available)');
    console.log('✅ Positive price movement verification passed.');

    // 5. Simulate negative price movement (BTCUSDT mark: $55,000) -> should show -$5.00 unrealized P&L
    console.log('\n5. Simulating negative price movement to $55,000 (-8.33% price, -$5.00 P&L)...');
    await prisma.position.update({
      where: { id: pos.id },
      data: { markPrice: 55000.00 },
    });

    account = await tradingService.account(testUserId);
    console.log(`📊 Stats with loss:
       Total Balance: $${account.totalBalance}
       Available Balance: $${account.availableBalance}
       Margin Used: $${account.marginUsed}
       Unrealized P&L: $${account.unrealizedPnl}`);

    assert.strictEqual(Number(account.unrealizedPnl), -5.00, 'unrealizedPnl should be -$5.00');
    assert.strictEqual(Number(account.totalBalance), 95.00, 'totalBalance (equity) should be $95.00 ($100.00 - $5.00 loss)');
    assert.strictEqual(Number(account.availableBalance), 94.00, 'availableBalance should remain $94.00');
    console.log('✅ Negative price movement verification passed.');

    // 6. Simulate position exit (Closed at exitPrice: $65,000) -> should realize +$5.00 net P&L
    console.log('\n6. Simulating position exit at $65,000 (realized profit: +$5.00)...');
    await prisma.$transaction([
      prisma.tradeHistory.create({
        data: {
          userId: testUserId,
          symbol: 'BTCUSDT',
          side: 'LONG',
          entryPrice: 60000.00,
          exitPrice: 65000.00,
          quantity: 0.001,
          leverage: 10,
          grossPnl: 5.00,
          feeUsd: 0.00,
          netPnl: 5.00,
          positionId: pos.id,
          openedAt: pos.openedAt,
          closedAt: new Date(),
        },
      }),
      prisma.position.update({
        where: { id: pos.id },
        data: {
          status: 'CLOSED',
          exitPrice: 65000.00,
          realizedPnl: 5.00,
          closedAt: new Date(),
        },
      }),
    ]);

    account = await tradingService.account(testUserId);
    console.log(`📊 Stats after position closed:
       Total Balance: $${account.totalBalance}
       Available Balance: $${account.availableBalance}
       Margin Used: $${account.marginUsed}
       Unrealized P&L: $${account.unrealizedPnl}
       Positions Count: ${account.openPositions}`);

    assert.strictEqual(Number(account.unrealizedPnl), 0.00, 'unrealizedPnl should reset to $0.00');
    assert.strictEqual(Number(account.marginUsed), 0.00, 'marginUsed should reset to $0.00');
    assert.strictEqual(Number(account.totalBalance), 105.00, 'totalBalance should settle at $105.00 ($100.00 + $5.00 realized profit)');
    assert.strictEqual(Number(account.availableBalance), 105.00, 'availableBalance should settle at $105.00 (margin released + realized profit)');
    assert.strictEqual(account.openPositions, 0, 'openPositions count should reset to 0');
    console.log('✅ Position exit verification passed.');

  } catch (error) {
    console.error('❌ E2E Test Suite Failed:', error);
    throw error;
  } finally {
    // 7. Cleanup test user from database (cascades to all user tables, delete audit logs manually first)
    if (testUserId) {
      console.log(`\n7. Cleaning up test user database records for ID: ${testUserId}...`);
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
      console.log('✅ Database cleanup completed cleanly.');
    }
  }

  console.log('\n🎉 ALL E2E PAPER TRADING TEST CASES PASSED SUCCESSFULLY! 🎉\n');
}

runE2ETests().catch(() => process.exit(1));
