import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const randomQueue = [];
const mockRandomInt = jest.fn((max) => {
  if (randomQueue.length > 0) return randomQueue.shift();
  return max > 1 ? max - 1 : 0;
});

jest.unstable_mockModule('crypto', () => ({
  randomInt: mockRandomInt,
}));

const DiceMechanics = await import('../../src/games/dice/dice.mechanics.js');

beforeEach(() => {
  jest.clearAllMocks();
  randomQueue.length = 0;
});

describe('Dice Better Luck behavior', () => {
  test('initializePlayerState sets hasBetterLuck from perks', () => {
    const state = DiceMechanics.initializePlayerState({
      userId: 'u1',
      displayName: 'P1',
      username: 'p1',
      avatarURL: 'x',
      perks: ['BETTER_LUCK'],
    });

    expect(state.hasBetterLuck).toBe(true);
  });

  test('performSecondRoll normal outcome uses fair 1-6 roll without Better Luck', () => {
    randomQueue.push(0); // randomInt(100): force NORMAL outcome
    randomQueue.push(3); // randomInt(6): fair roll -> 4

    const result = DiceMechanics.performSecondRoll(2, false);

    expect(result.type).toBe('NORMAL');
    expect(result.value).toBe(4);
    expect(result.display).toBe('4');
    expect(mockRandomInt).toHaveBeenNthCalledWith(1, 100);
    expect(mockRandomInt).toHaveBeenNthCalledWith(2, 6);
  });

  test('performSecondRoll normal outcome uses weighted roll with Better Luck', () => {
    randomQueue.push(0); // randomInt(100): force NORMAL outcome
    randomQueue.push(999_999); // randomInt(1_000_000): weighted picker near top -> 6

    const result = DiceMechanics.performSecondRoll(2, true);

    expect(result.type).toBe('NORMAL');
    expect(result.value).toBe(6);
    expect(result.display).toBe('6');
    expect(mockRandomInt).toHaveBeenNthCalledWith(1, 100);
    expect(mockRandomInt).toHaveBeenNthCalledWith(2, 1_000_000);
  });

  test('rollDie with Better Luck respects weighted domain boundaries', () => {
    randomQueue.push(0); // randomInt(1_000_000) => first weighted bucket
    const roll = DiceMechanics.rollDie(true);
    expect(roll).toBeGreaterThanOrEqual(1);
    expect(roll).toBeLessThanOrEqual(6);
  });
});
