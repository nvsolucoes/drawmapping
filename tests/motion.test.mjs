import test from 'node:test';
import assert from 'node:assert/strict';
import { motionTiming, reflowEase } from '../src/lib/motion.ts';

test('reorganização tem easing progressivo e respeita movimento reduzido', () => {
  assert.equal(reflowEase(0), 0);
  assert.equal(reflowEase(1), 1);
  assert.ok(reflowEase(.5) > .5 && reflowEase(.5) < 1);
  assert.equal(reflowEase(-1), 0);
  assert.equal(reflowEase(2), 1);
  assert.ok(motionTiming('expressive').reflow > motionTiming('soft').reflow);
  assert.equal(motionTiming('reduced').reflow, 0);
});
