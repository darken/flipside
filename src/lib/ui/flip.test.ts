import { describe, expect, it } from 'vitest';
import {
  AUTO_FLIP_DELAY_MS,
  EDGE_PX,
  angleFor,
  cubicBezier,
  depth,
  durationFor,
  flipEase,
  nearestRest,
  normalizeAngle,
  restAngle,
  sampleFlip,
  shouldAutoFlip,
  shouldFinish,
  startsInEdgeZone,
  transformFor,
  type AutoFlipContext,
} from './flip';

describe('angleFor', () => {
  it('maps the full width to 180 degrees', () => {
    expect(angleFor(100, 400)).toBe(45);
    expect(angleFor(-200, 400)).toBe(-90);
    expect(angleFor(400, 400)).toBe(180);
  });

  it('clamps to a half turn either way', () => {
    expect(angleFor(900, 400)).toBe(180);
    expect(angleFor(-900, 400)).toBe(-180);
  });

  it('is zero for a zero width', () => {
    expect(angleFor(50, 0)).toBe(0);
  });
});

describe('shouldFinish', () => {
  it('finishes past 90 degrees in either direction', () => {
    expect(shouldFinish(91, 0)).toBe(true);
    expect(shouldFinish(-120, 0)).toBe(true);
  });

  it('springs back at or before 90 degrees when slow', () => {
    expect(shouldFinish(90, 0.1)).toBe(false);
    expect(shouldFinish(-40, -0.2)).toBe(false);
  });

  it('finishes a fast flick in the direction of the drag', () => {
    expect(shouldFinish(20, 0.8)).toBe(true);
    expect(shouldFinish(-20, -0.8)).toBe(true);
    expect(shouldFinish(20, 0.5)).toBe(false); // exactly at the limit is not faster
  });

  it('does not finish when the flick goes the other way', () => {
    expect(shouldFinish(30, -0.9)).toBe(false);
    expect(shouldFinish(0, 0.9)).toBe(false);
  });
});

describe('startsInEdgeZone', () => {
  it('rejects the outer 20 px on both sides', () => {
    expect(startsInEdgeZone(0, 390)).toBe(true);
    expect(startsInEdgeZone(EDGE_PX - 1, 390)).toBe(true);
    expect(startsInEdgeZone(390 - EDGE_PX + 1, 390)).toBe(true);
    expect(startsInEdgeZone(EDGE_PX, 390)).toBe(false);
    expect(startsInEdgeZone(195, 390)).toBe(false);
    expect(startsInEdgeZone(390 - EDGE_PX, 390)).toBe(false);
  });
});

describe('poses', () => {
  it('has no tilt, scale or shade at rest', () => {
    expect(depth(0)).toBe(0);
    expect(depth(180)).toBe(0);
    expect(depth(360)).toBe(0);
    expect(transformFor(0)).toBe('rotateY(0.000deg) rotateX(0.000deg) scale(1.0000)');
  });

  it('is deepest edge-on: scaled to 0.96 and tilted 4 degrees', () => {
    expect(depth(90)).toBe(1);
    expect(depth(-90)).toBe(1);
    expect(transformFor(90)).toBe('rotateY(90.000deg) rotateX(4.000deg) scale(0.9600)');
  });

  it('is symmetric', () => {
    expect(depth(45)).toBeCloseTo(depth(135));
    expect(depth(-45)).toBeCloseTo(depth(45));
  });
});

describe('rest angles', () => {
  it('puts the todo side at 0 and the done side at 180', () => {
    expect(restAngle('todo')).toBe(0);
    expect(restAngle('done')).toBe(180);
  });

  it('turns right to left by default: 0 -> -180 -> -360', () => {
    expect(nearestRest(0, 'done')).toBe(-180);
    expect(nearestRest(-180, 'todo')).toBe(-360);
  });

  it('after normalising, keeps turning the same way', () => {
    expect(nearestRest(180, 'todo')).toBe(0);
    expect(nearestRest(0, 'done', 1)).toBe(180);
  });

  it('reverses a flip that is part way through', () => {
    expect(nearestRest(-100, 'todo')).toBe(0);
    expect(nearestRest(-100, 'done')).toBe(-180);
    expect(nearestRest(-260, 'done')).toBe(-180);
    expect(nearestRest(-260, 'todo')).toBe(-360);
  });

  it('normalises angles into [0, 360)', () => {
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(-360)).toBe(0);
    expect(normalizeAngle(540)).toBe(180);
  });
});

describe('timing', () => {
  it('takes 600 ms for a half turn and less for part of one, but not abruptly', () => {
    expect(durationFor(0, -180)).toBe(600);
    expect(durationFor(0, 180)).toBe(600);
    expect(durationFor(-90, -180)).toBe(300);
    expect(durationFor(-170, -180)).toBe(220);
  });

  it('eases from 0 to 1, front-loaded', () => {
    expect(flipEase(0)).toBe(0);
    expect(flipEase(1)).toBe(1);
    expect(flipEase(0.5)).toBeGreaterThan(0.5);
    expect(flipEase(0.25)).toBeLessThan(flipEase(0.5));
  });

  it('matches a linear bezier', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 3);
  });

  it('samples keyframes along the eased path', () => {
    const frames = sampleFlip(0, -180, 4);
    expect(frames.map((f) => f.offset)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(frames[0]!.angle).toBe(0);
    expect(frames[4]!.angle).toBe(-180);
    expect(frames[2]!.angle).toBeLessThan(-90);
  });
});

describe('shouldAutoFlip', () => {
  const base: AutoFlipContext = {
    cause: 'check',
    editable: true,
    side: 'todo',
    busy: false,
    alreadyFlipped: false,
  };

  it('turns the page when the last open task is checked off', () => {
    expect(shouldAutoFlip(1, 0, base)).toBe(true);
  });

  it('does not turn it while tasks remain', () => {
    expect(shouldAutoFlip(3, 2, base)).toBe(false);
    expect(shouldAutoFlip(2, 1, base)).toBe(false);
  });

  it('does not turn it when nothing changed or the list grew', () => {
    expect(shouldAutoFlip(0, 0, base)).toBe(false);
    expect(shouldAutoFlip(0, 1, base)).toBe(false);
  });

  it('does not turn it when the list emptied another way', () => {
    expect(shouldAutoFlip(1, 0, { ...base, cause: 'delete' })).toBe(false);
    expect(shouldAutoFlip(1, 0, { ...base, cause: 'copy' })).toBe(false);
    expect(shouldAutoFlip(1, 0, { ...base, cause: 'other' })).toBe(false);
  });

  it('does not turn a past page', () => {
    expect(shouldAutoFlip(1, 0, { ...base, editable: false })).toBe(false);
  });

  it('does not turn when a drag, edit or menu is open', () => {
    expect(shouldAutoFlip(1, 0, { ...base, busy: true })).toBe(false);
  });

  it('does not turn when already on the back', () => {
    expect(shouldAutoFlip(1, 0, { ...base, side: 'done' })).toBe(false);
  });

  it('only turns once', () => {
    expect(shouldAutoFlip(1, 0, { ...base, alreadyFlipped: true })).toBe(false);
  });

  it('can be switched off', () => {
    expect(shouldAutoFlip(1, 0, { ...base, enabled: false })).toBe(false);
    expect(shouldAutoFlip(1, 0, { ...base, enabled: true })).toBe(true);
  });

  it('waits about 400 ms so the check-off animation can finish', () => {
    expect(AUTO_FLIP_DELAY_MS).toBe(400);
  });
});
