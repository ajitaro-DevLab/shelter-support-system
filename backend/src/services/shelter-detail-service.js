import { getDisplayConfidence } from '../domain/confidence-display.js';

export function createShelterDetailService({ repository, now = () => new Date() }) {
  return {
    async get(shelterId) {
      const detail = await repository.getDetail(shelterId);
      if (!detail) return null;

      return {
        ...detail,
        confidence: getDisplayConfidence(detail, now())
      };
    }
  };
}
