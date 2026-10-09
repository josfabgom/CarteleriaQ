const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.screen.findMany().then(console.log).finally(() => p.$disconnect());
