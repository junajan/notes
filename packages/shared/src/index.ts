import { z } from 'zod';

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  content: z.string(),
  positionIndex: z.number().int(),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens").optional().nullable(),
  isPublic: z.number().int().default(0), // 0 for false, 1 for true
  isPublicEditable: z.number().int().default(0), // 0 for false, 1 for true
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Note = z.infer<typeof NoteSchema>;

export const CreateNoteSchema = NoteSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

// Zod 4 applies .default() even inside .partial(), which would reset these flags on every PATCH
export const UpdateNoteSchema = NoteSchema.extend({
  isPublic: z.number().int(),
  isPublicEditable: z.number().int(),
}).partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true // set by the server only
});

export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;

/**
 * PATCH body: the fields to change, plus the `updatedAt` of the version the edit is based on.
 * If the note has changed since, the server rejects the edit with 409 instead of overwriting.
 */
export type UpdateNoteRequest = UpdateNoteInput & { baseUpdatedAt?: string };
