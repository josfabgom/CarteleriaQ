import prisma from './prisma';
import { BYTES_PER_MB } from './config';

export interface Usage {
  screens: number;
  maxScreens: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
}

export async function getUsage(businessId: string): Promise<Usage> {
  const [business, screens, media] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.screen.count({ where: { businessId } }),
    prisma.media.aggregate({ where: { businessId }, _sum: { size: true } })
  ]);
  return {
    screens,
    maxScreens: business.maxScreens,
    storageUsedBytes: media._sum.size ?? 0,
    storageLimitBytes: business.storageLimitMb * BYTES_PER_MB
  };
}
