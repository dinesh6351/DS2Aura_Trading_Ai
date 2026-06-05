import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cfg = await prisma.botConfig.findMany();
  const acc = await prisma.tradingAccount.findMany();
  const dbOpen = await prisma.position.findMany({ where: { status: 'OPEN' } });
  console.log('cfg', cfg);
  console.log('acc', acc);
  console.log('open', dbOpen);
}
main();
