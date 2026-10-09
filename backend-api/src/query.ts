import prisma from './prisma';
prisma.screen.findMany().then(console.log).finally(() => prisma.$disconnect());
