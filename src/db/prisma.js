/**
 * Singleton PrismaClient instance
 * Import this everywhere instead of creating new PrismaClient()
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
