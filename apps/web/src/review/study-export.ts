// "Save this line as a study" for the tree review surfaces.
//
// The tree controller already hands back exactly the blob POST /api/studies wants
// for its first chapter (TreeReviewHandle.serialize() -> SerializedTree), so this
// is a thin call: create, then navigate to the new study.
//
// Auth is resolved by the response, not by asking first — the same idiom the
// study index uses (a 401 becomes a message, not a thrown error). There is no
// name prompt: the study is created private under a derived name and the study
// page owns renaming (PATCH /api/studies/:id). One click here, edit there.

import type { StudyVariantId } from '../study-catalog.js';
import type { SerializedTree } from './tree-serialize.js';

export interface StudyExportRequest {
  variant: StudyVariantId;
  /** Study + first-chapter name, e.g. "Xiangqi analysis". */
  name: string;
  tree: SerializedTree;
}

export type StudyExportResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'unauthenticated' | 'failed' };

/** Create a private study from a serialized tree. Does NOT navigate — the caller
 *  decides, so this stays testable without stubbing window.location. */
export async function createStudyFromTree(request: StudyExportRequest): Promise<StudyExportResult> {
  let response: Response;
  try {
    response = await fetch('/api/studies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: request.name,
        // Private by default: this is a one-click write to the user's account,
        // so it must not publish anything. The study page can widen it.
        visibility: 'private',
        chapter: { name: 'Chapter 1', variant: request.variant, root: request.tree },
      }),
    });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (response.status === 401) return { ok: false, reason: 'unauthenticated' };
  if (!response.ok) return { ok: false, reason: 'failed' };
  try {
    const body = (await response.json()) as { study?: { id?: string } };
    const id = body.study?.id;
    return id ? { ok: true, id } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function studyExportMessage(reason: 'unauthenticated' | 'failed'): string {
  return reason === 'unauthenticated'
    ? 'Sign in to save this as a study.'
    : 'Could not create the study. Try again.';
}
