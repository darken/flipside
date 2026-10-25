import { describe, expect, it } from 'vitest';
import {
  COMMIT_PROGRESS,
  DEAD_ZONE_PX,
  RESIST_MAX_PX,
  WHEEL_COOLDOWN_MS,
  WHEEL_PAUSE_MS,
  WHEEL_THRESHOLD_PX,
  edgesOf,
  neighbours,
  peelDirection,
  peelDuration,
  peelEase,
  peelProgress,
  pullPastDeadZone,
  resist,
  samplePeel,
  shouldCommitPeel,
  skippedBetween,
  skippedLabel,
  topPose,
  underPose,
  wheelStep,
  type WheelState,
} from './peel';

describe('dead zone and progress', () => {
  it('ignores the first 24 px past the end of the list', () => {
    expect(pullPastDeadZone(0)).toBe(0);
    expect(pullPastDeadZone(DEAD_ZONE_PX)).toBe(0);
    expect(pullPastDeadZone(DEAD_ZONE_PX + 10)).toBe(10);
    expect(peelProgress(20, 600)).toBe(0);
  });

  it('is the pull beyond the dead zone as a share of the page height', () => {
    expect(peelProgress(24 + 300, 600)).toBe(0.5);
    expect(peelProgress(24 + 150, 600)).toBe(0.25);
  });

  it('clamps to 0..1 and survives a zero height', () => {
    expect(peelProgress(5000, 600)).toBe(1);
    expect(peelProgress(-50, 600)).toBe(0);
    expect(peelProgress(100, 0)).toBe(0);
  });
});

describe('shouldCommitPeel', () => {
  it('finishes past 35 %', () => {
    expect(shouldCommitPeel(COMMIT_PROGRESS + 0.01, 0)).toBe(true);
    expect(shouldCommitPeel(0.6, 0.1)).toBe(true);
  });

  it('springs back at or before 35 % when slow', () => {
    expect(shouldCommitPeel(COMMIT_PROGRESS, 0.1)).toBe(false);
    expect(shouldCommitPeel(0.1, 0.2)).toBe(false);
    expect(shouldCommitPeel(0, 0)).toBe(false);
  });

  it('finishes a fast flick, but not one that never moved the page', () => {
    expect(shouldCommitPeel(0.05, 0.8)).toBe(true);
    expect(shouldCommitPeel(0.05, 0.5)).toBe(false);
    expect(shouldCommitPeel(0, 2)).toBe(false);
  });
});

describe('peelDirection (momentum guard)', () => {
  const atBottom = { atTop: false, atBottom: true };
  const atTop = { atTop: true, atBottom: false };
  const middle = { atTop: false, atBottom: false };
  const fits = { atTop: true, atBottom: true };

  it('pulling up needs the list to have been at its bottom when the touch began', () => {
    expect(peelDirection(-30, atBottom)).toBe('older');
    expect(peelDirection(-30, middle)).toBeNull();
    expect(peelDirection(-30, atTop)).toBeNull();
  });

  it('pulling down needs the list to have been at its top', () => {
    expect(peelDirection(30, atTop)).toBe('newer');
    expect(peelDirection(30, middle)).toBeNull();
    expect(peelDirection(30, atBottom)).toBeNull();
  });

  it('a list that fits on one screen can peel either way', () => {
    expect(peelDirection(-30, fits)).toBe('older');
    expect(peelDirection(30, fits)).toBe('newer');
  });

  it('does nothing without movement', () => {
    expect(peelDirection(0, fits)).toBeNull();
  });
});

describe('edgesOf', () => {
  it('reads the scroll position', () => {
    expect(edgesOf(0, 500, 1500)).toEqual({ atTop: true, atBottom: false });
    expect(edgesOf(500, 500, 1500)).toEqual({ atTop: false, atBottom: false });
    expect(edgesOf(1000, 500, 1500)).toEqual({ atTop: false, atBottom: true });
    expect(edgesOf(999.5, 500, 1500)).toEqual({ atTop: false, atBottom: true });
  });

  it('treats a list that fits as being at both ends', () => {
    expect(edgesOf(0, 500, 300)).toEqual({ atTop: true, atBottom: true });
  });
});

describe('resist', () => {
  it('stretches less and less, and never past the limit', () => {
    expect(resist(0)).toBe(0);
    expect(resist(-20)).toBe(0);
    expect(resist(50)).toBeGreaterThan(0);
    expect(resist(50)).toBeLessThan(50);
    expect(resist(100) - resist(50)).toBeLessThan(resist(50));
    expect(resist(100_000)).toBeLessThanOrEqual(RESIST_MAX_PX);
  });
});

describe('neighbours', () => {
  const keys = ['2026-10-25', '2026-10-24', '2026-10-20', '2026-10-01'];

  it('finds the newer and older saved pages', () => {
    expect(neighbours(keys, '2026-10-24')).toEqual({ newer: '2026-10-25', older: '2026-10-20' });
  });

  it('has no newer page for today', () => {
    expect(neighbours(keys, '2026-10-25')).toEqual({ newer: null, older: '2026-10-24' });
  });

  it('has no older page for the oldest', () => {
    expect(neighbours(keys, '2026-10-01')).toEqual({ newer: '2026-10-20', older: null });
  });

  it('handles an unknown key and a single page', () => {
    expect(neighbours(keys, '2026-01-01')).toEqual({ newer: null, older: null });
    expect(neighbours(['2026-10-25'], '2026-10-25')).toEqual({ newer: null, older: null });
    expect(neighbours([], '2026-10-25')).toEqual({ newer: null, older: null });
  });
});

describe('skippedBetween', () => {
  it('is zero for consecutive days', () => {
    expect(skippedBetween('2026-10-25', '2026-10-24')).toBe(0);
  });

  it('counts the missing days between two pages', () => {
    expect(skippedBetween('2026-10-24', '2026-10-20')).toBe(3);
    expect(skippedBetween('2026-10-24', '2026-10-21')).toBe(2);
  });

  it('works across a month and year boundary and a leap day', () => {
    expect(skippedBetween('2026-11-02', '2026-10-30')).toBe(2);
    expect(skippedBetween('2027-01-02', '2026-12-30')).toBe(2);
    expect(skippedBetween('2024-03-02', '2024-02-27')).toBe(3);
  });

  it('never goes negative', () => {
    expect(skippedBetween('2026-10-20', '2026-10-24')).toBe(0);
    expect(skippedBetween('2026-10-20', '2026-10-20')).toBe(0);
  });

  it('words the note', () => {
    expect(skippedLabel(1)).toBe('1 day skipped');
    expect(skippedLabel(2)).toBe('2 days skipped');
  });
});

describe('poses', () => {
  it('has no transform when the page is on screen', () => {
    expect(topPose(0)).toEqual({ transform: 'none', shadow: 0 });
  });

  it('lifts up to minus 100 % and tilts back 12 degrees, with a growing shadow', () => {
    const full = topPose(1);
    expect(full.transform).toContain('translateY(-100.000%)');
    expect(full.transform).toContain('rotateX(12.000deg)');
    expect(full.shadow).toBe(1);
    expect(topPose(0.1).shadow).toBeGreaterThan(0);
    expect(topPose(0.1).shadow).toBeLessThan(topPose(0.2).shadow);
  });

  it('clamps outside 0..1', () => {
    expect(topPose(-1).transform).toBe('none');
    expect(topPose(2)).toEqual(topPose(1));
  });

  it('shows the page underneath scaled to 0.96 and dimmed 25 %, easing to full size', () => {
    expect(underPose(0)).toEqual({ transform: 'scale(0.9600)', dim: 0.25 });
    expect(underPose(1)).toEqual({ transform: 'none', dim: 0 });
    expect(underPose(0.5).dim).toBeCloseTo(0.125);
    expect(underPose(0.5).transform).toBe('scale(0.9800)');
  });
});

describe('timing', () => {
  it('eases front-loaded from 0 to 1', () => {
    expect(peelEase(0)).toBe(0);
    expect(peelEase(1)).toBe(1);
    expect(peelEase(0.5)).toBeGreaterThan(0.5);
  });

  it('samples a path between two progress values', () => {
    const frames = samplePeel(0.3, 1, 4);
    expect(frames).toHaveLength(5);
    expect(frames[0]!.p).toBe(0.3);
    expect(frames[4]!.p).toBe(1);
  });

  it('takes 450 ms for a full peel and less for part of one, not abruptly', () => {
    expect(peelDuration(0, 1)).toBe(450);
    expect(peelDuration(1, 0)).toBe(450);
    expect(peelDuration(0.5, 1)).toBe(225);
    expect(peelDuration(0.95, 1)).toBe(160);
    expect(peelDuration(0, 1, 100)).toBe(160);
  });
});

describe('wheelStep', () => {
  const fresh = (over: Partial<WheelState> = {}): WheelState => ({
    acc: 0,
    lastScrollAt: 0,
    lockedUntil: 0,
    ...over,
  });

  it('turns a page once about 120 px of extra scrolling has built up', () => {
    let state = fresh({ lastScrollAt: 0 });
    let r = wheelStep(state, { deltaY: 50, atEdge: true, now: 1000 });
    expect(r.turn).toBe(false);
    r = wheelStep(r.state, { deltaY: 50, atEdge: true, now: 1020 });
    expect(r.turn).toBe(false);
    r = wheelStep(r.state, { deltaY: 30, atEdge: true, now: 1040 });
    expect(r.turn).toBe(true);
    state = r.state;
    expect(state.acc).toBe(0);
  });

  it('turns one page for one big wheel event', () => {
    const r = wheelStep(fresh(), { deltaY: WHEEL_THRESHOLD_PX, atEdge: true, now: 1000 });
    expect(r.turn).toBe(true);
  });

  it('waits for the list to have been still for a moment', () => {
    const r = wheelStep(fresh({ lastScrollAt: 1000 }), {
      deltaY: 500,
      atEdge: true,
      now: 1000 + WHEEL_PAUSE_MS - 1,
    });
    expect(r.turn).toBe(false);
    const later = wheelStep(fresh({ lastScrollAt: 1000 }), {
      deltaY: 500,
      atEdge: true,
      now: 1000 + WHEEL_PAUSE_MS,
    });
    expect(later.turn).toBe(true);
  });

  it('ignores the wheel away from the end of the list', () => {
    const r = wheelStep(fresh({ acc: 100 }), { deltaY: 500, atEdge: false, now: 5000 });
    expect(r.turn).toBe(false);
    expect(r.state.acc).toBe(0);
  });

  it('turns only one page per burst, then cools down', () => {
    const first = wheelStep(fresh(), { deltaY: 200, atEdge: true, now: 1000 });
    expect(first.turn).toBe(true);
    const during = wheelStep(first.state, { deltaY: 200, atEdge: true, now: 1000 + 100 });
    expect(during.turn).toBe(false);
    const after = wheelStep(first.state, {
      deltaY: 200,
      atEdge: true,
      now: 1000 + WHEEL_COOLDOWN_MS,
    });
    expect(after.turn).toBe(true);
  });

  it('works for the upward direction too', () => {
    const r = wheelStep(fresh(), { deltaY: -150, atEdge: true, now: 1000 });
    expect(r.turn).toBe(true);
  });
});
