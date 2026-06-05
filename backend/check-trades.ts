import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const dbOpen = await prisma.position.findMany({ where: { status: 'OPEN' } });
  console.log('open trades:', dbOpen.length);
  if (dbOpen.length > 0) console.log(dbOpen);
}
main();
