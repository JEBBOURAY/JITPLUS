/**
 * Generic repository interface.
 * Extend this for domain-specific repositories to decouple
 * business logic from the data-access layer (Prisma, SQL, etc.).
 */
export interface IRepository<T, CreateDto = Partial<T>, UpdateDto = Partial<T>> {
  findMany(filter: Record<string, unknown>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: CreateDto): Promise<T>;
  update(id: string, data: UpdateDto): Promise<T>;
  delete(id: string): Promise<T>;
}
