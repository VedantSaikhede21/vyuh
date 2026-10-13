import { z } from 'zod';

/**
 * Every schema that should appear as a named type in the exported JSON Schema
 * (and therefore as a named Pydantic model) is registered here with a stable id.
 */
export const schemaRegistry = z.registry<{ id: string; description?: string }>();

export function named<T extends z.ZodType>(id: string, schema: T, description?: string): T {
  schemaRegistry.add(schema as z.ZodType, description === undefined ? { id } : { id, description });
  return schema;
}
