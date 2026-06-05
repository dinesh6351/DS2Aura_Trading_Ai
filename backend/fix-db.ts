import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.botConfig.updateMany({
    data: { status: 'RUNNING', scoreThreshold: 10, useAdaptiveLearning: false }
  });
  console.log("Updated all bot configs to RUNNING and threshold 10");
}
main();
