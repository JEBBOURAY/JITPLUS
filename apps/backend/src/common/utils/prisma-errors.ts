import { Prisma } from '@prisma/client';

/** A unique constraint refused the write (Prisma P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
