import { describe, it } from 'vitest';
import * as eventsAlias from '@soostori/events';

describe('events module exports check (root test)', () => {
  it('shows ALL keys', () => {
    console.log('ALL keys:', Object.keys(eventsAlias).sort());
  });
});
