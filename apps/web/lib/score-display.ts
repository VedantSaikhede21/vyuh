import type { Score, ScoreDisplay } from '@vyuh/shared';

/**
 * What to show for a score (decision 149): the API's display values, rounded
 * once on the server. The raw fallback only covers a response from an API
 * older than Phase 6B; the client never rounds a score itself.
 */
export function displayScore(score: Score): ScoreDisplay {
  return score.display ?? { total: score.total, components: score.components };
}
