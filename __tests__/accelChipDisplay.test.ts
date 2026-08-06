import {
  formatAccelLogDisplay,
  type AccelStatusSnapshotLike,
} from '../src/utils/accelChipDisplay';

function snap(
  partial: Partial<AccelStatusSnapshotLike> &
    Pick<AccelStatusSnapshotLike, 'on'>,
): AccelStatusSnapshotLike {
  return {
    available: false,
    availableKind: 'none',
    availableLabel: 'None detected',
    onLabel: 'Off (CPU)',
    summary: 'Summary line.',
    ...partial,
  };
}

describe('formatAccelLogDisplay', () => {
  it('formats no-model status for logs', () => {
    const d = formatAccelLogDisplay(
      snap({
        on: null,
        onLabel: 'No model loaded',
        available: true,
        availableKind: 'opencl',
        availableLabel: 'OpenCL GPU',
      }),
    );
    expect(d.shortLabel).toBe('none');
    expect(d.message).toContain('No model loaded');
    expect(d.message).toContain('OpenCL GPU');
    expect(d.context.available).toBe(true);
  });

  it('labels CPU when model loaded but accel off', () => {
    const d = formatAccelLogDisplay(
      snap({
        on: false,
        onLabel: 'Off — quant not allowlisted',
        available: true,
        availableKind: 'htp',
        availableLabel: 'Hexagon NPU',
      }),
    );
    expect(d.shortLabel).toBe('CPU');
    expect(d.message).toContain('Off — quant not allowlisted');
    expect(d.message).toContain('Hexagon NPU');
    expect(d.context.summary).toBe('Summary line.');
  });

  it('labels NPU when HTP accel is on', () => {
    const d = formatAccelLogDisplay(
      snap({
        on: true,
        onLabel: 'HTP0',
        available: true,
        availableKind: 'htp',
        availableLabel: 'Hexagon NPU',
      }),
    );
    expect(d.shortLabel).toBe('NPU');
    expect(d.message).toContain('On · HTP0');
  });

  it('labels GPU when OpenCL accel is on', () => {
    const d = formatAccelLogDisplay(
      snap({
        on: true,
        onLabel: 'GPU layers 8',
        available: true,
        availableKind: 'opencl',
        availableLabel: 'OpenCL GPU',
      }),
    );
    expect(d.shortLabel).toBe('GPU');
  });

  it('falls back to Accel when on without known kind', () => {
    const d = formatAccelLogDisplay(
      snap({
        on: true,
        onLabel: 'GPU',
        available: false,
        availableKind: 'none',
        availableLabel: 'None detected',
      }),
    );
    expect(d.shortLabel).toBe('Accel');
  });
});
