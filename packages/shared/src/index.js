"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateNoteSchema = exports.CreateNoteSchema = exports.NoteSchema = void 0;
const zod_1 = require("zod");
exports.NoteSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(1, "Title is required"),
    content: zod_1.z.string(),
    positionIndex: zod_1.z.number().int(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.CreateNoteSchema = exports.NoteSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true
});
exports.UpdateNoteSchema = exports.NoteSchema.partial().omit({
    id: true,
    createdAt: true
});
