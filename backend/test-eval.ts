import { PrismaClient } from '@prisma/client';
import { getMarketStatus } from './src/modules/binance/market.service.js';
import { signalsOverview } from './src/modules/bot/analysis.service.js';

const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  const cfg = await prisma.botConfig.findUnique({ where: { userId: users[0].id } });
  const market = await getMarketStatus();
  const signals = await signalsOverview(['BTCUSDT', 'ETHUSDT', 'BNBUSDT'], cfg, market);
  console.log(JSON.stringify(signals, null, 2));
}
main();
