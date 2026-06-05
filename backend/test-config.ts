import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  if (users.length > 0) {
    const config = await prisma.botConfig.findUnique({ where: { userId: users[0].id } });
    console.log(config);
  } else {
    console.log('No users found.');
  }
}
main();
