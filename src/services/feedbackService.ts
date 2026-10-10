import type { Feedback } from '@/types';
import { uid } from '@/utils/id';
import { round2 } from '@/utils/money';
import { commit, read, scopeTo, ServiceError, stamped } from './db';

export type FeedbackInput = Omit<Feedback, 'id' | 'createdAt' | 'updatedAt'>;

export async function record(input: FeedbackInput): Promise<Feedback> {
  if (input.rating < 1 || input.rating > 5) throw new ServiceError('Pick a rating from 1 to 5.', 'validation');
  if (input.saleId && read().feedback.some((f) => f.saleId === input.saleId)) {
    throw new ServiceError('Feedback for this bill has already been recorded.', 'conflict');
  }
  const row: Feedback = stamped({ id: uid('fbk'), ...input, comment: input.comment.trim() });
  return commit((db) => {
    db.feedback = [row, ...db.feedback];
    return row;
  });
}

export function averageRating(rows: Feedback[]): number {
  return rows.length ? round2(rows.reduce((s, f) => s + f.rating, 0) / rows.length) : 0;
}

export function listSync(shopId: string | null): Feedback[] {
  return [...scopeTo(read().feedback, shopId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
