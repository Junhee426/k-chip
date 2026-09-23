// Shared, mutable UI state. Modules read and replace these fields; render() in
// app.js redraws from them.
import { createProject } from './data.js';

export const state = { project: createProject(), page: 'lab', campaign: null };
export const selected = () => state.project.parts.find(p => p.id === state.project.selectedPartId);
