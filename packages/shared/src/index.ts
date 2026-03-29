import { z } from 'zod';

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  content: z.string(),
  positionIndex: z.number().int(),
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

export const UpdateNoteSchema = NoteSchema.partial().omit({
  id: true,
  createdAt: true
});

export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
