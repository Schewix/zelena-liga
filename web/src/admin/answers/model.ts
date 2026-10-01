import { AnswersFormState,AnswersSummary } from '../types';

export function createEmptyAnswers(): AnswersFormState {
  return { N: '', M: '', S: '', R: '' };
}

export function createEmptySummary(): AnswersSummary {
  return {
    N: { letters: [], updatedAt: null },
    M: { letters: [], updatedAt: null },
    S: { letters: [], updatedAt: null },
    R: { letters: [], updatedAt: null },
  };
}
