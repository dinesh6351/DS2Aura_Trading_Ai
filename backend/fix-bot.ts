import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  if (users.length > 0) {
    const config = await prisma.botConfig.update({
      where: { userId: users[0].id },
      data: {
        scoreThreshold: 10,
        useAdxFilter: false,
        useEmaTrend: false,
        useRsi: false,
        useVolume: false,
        useAtr: false,
      }
    });
    console.log("Updated config to be super loose:");
    console.log(config);
  } else {
    console.log('No users found.');
  }
}
main();
