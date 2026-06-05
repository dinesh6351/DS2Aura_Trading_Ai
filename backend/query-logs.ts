import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const notifs = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log(notifs);
}
main();
