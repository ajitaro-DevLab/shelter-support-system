import { getDisplayConfidence } from '../domain/confidence-display.js';
import { getFreshness } from '../domain/freshness.js';

export function createHqService({ repository, now = () => new Date() }) {
  return {
    async list() {
      const shelters = await repository.listForHq();
      const referenceTime = now();

      return shelters.map(({ confirmationSlot, ...shelter }) => ({
        ...shelter,
        freshness: getFreshness(shelter.confirmedAt, referenceTime),
        confidence: getDisplayConfidence({
          confidence: shelter.confidence,
          confirmationSlot,
          confirmedAt: shelter.confirmedAt
        }, referenceTime)
      }));
    }
  };
}
