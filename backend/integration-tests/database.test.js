import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { closePool, verifyDatabaseConnection } from '../src/db/pool.js';
import { shelterRepository } from '../src/repositories/shelter-repository.js';

describe('PostgreSQL migration and seed', () => {
  after(async () => {
    await closePool();
  });

  it('connects to PostgreSQL and returns the five seeded shelters', async () => {
    await verifyDatabaseConnection();
    const shelters = await shelterRepository.listActive();

    assert.equal(shelters.length, 5);
    assert.deepEqual(shelters.map((shelter) => shelter.id), [
      'shelter-001',
      'shelter-002',
      'shelter-003',
      'shelter-004',
      'shelter-005'
    ]);
    assert.equal(shelters[1].name, 'I市立Alpha中学校');
    assert.equal(shelters[1].currentCount, 86);
  });
});
