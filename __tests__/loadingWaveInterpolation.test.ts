import {
  buildLeftToRightWave,
  buildCenterPulseKeyframes,
} from '../src/components/loading-ui/waveInterpolation';

describe('waveInterpolation', () => {
  describe('buildLeftToRightWave', () => {
    it('generates consistent parallel arrays spanning [0, 1]', () => {
      const result = buildLeftToRightWave(0, 40, 2, 0.94, 1.12, 0.94);
      expect(result.inputRange.length).toBeGreaterThan(30);
      expect(result.rangeX.length).toBe(result.inputRange.length);
      expect(result.rangeY.length).toBe(result.inputRange.length);
      expect(result.rangeScale.length).toBe(result.inputRange.length);
      expect(result.rangeOpacity.length).toBe(result.inputRange.length);

      expect(result.inputRange[0]).toBe(0);
      expect(result.inputRange[result.inputRange.length - 1]).toBe(1);

      // Verify input range is strictly monotonically increasing
      for (let i = 1; i < result.inputRange.length; i++) {
        expect(result.inputRange[i]).toBeGreaterThan(result.inputRange[i - 1]);
      }
    });

    it('keeps X within travel bounds and peaks opacity in the center', () => {
      const travelDist = 40;
      const maxOpacity = 0.9;
      const result = buildLeftToRightWave(0, travelDist, 2, 0.94, 1.12, maxOpacity);

      for (const x of result.rangeX) {
        expect(x).toBeGreaterThanOrEqual(-travelDist);
        expect(x).toBeLessThanOrEqual(travelDist);
      }

      // Max opacity should approach peak maxOpacity near center
      const peakOp = Math.max(...result.rangeOpacity);
      expect(peakOp).toBeCloseTo(maxOpacity, 1);
    });

    it('handles phase offset seamlessly with zero opacity near wrap point', () => {
      const phaseOffset = 0.5;
      const result = buildLeftToRightWave(phaseOffset, 40, 2, 0.94, 1.10, 0.8);

      // Wrap point is at (1.0 - 0.5) = 0.5.
      // Right around 0.5, opacity must drop to 0 for a seamless jump-free reset.
      const nearWrapIdx = result.inputRange.findIndex((p) => Math.abs(p - 0.5) < 0.001);
      expect(nearWrapIdx).toBeGreaterThan(-1);
      expect(result.rangeOpacity[nearWrapIdx]).toBe(0);
    });
  });

  describe('buildCenterPulseKeyframes', () => {
    it('creates cyclic continuous center breathing keyframes', () => {
      const minOp = 0.22;
      const maxOp = 0.40;
      const result = buildCenterPulseKeyframes(minOp, maxOp);

      expect(result.cInput[0]).toBe(0);
      expect(result.cInput[result.cInput.length - 1]).toBe(1);
      expect(result.cOpacity.length).toBe(result.cInput.length);
      expect(result.cScale.length).toBe(result.cInput.length);

      // Boundaries should be cyclic: start equals end
      expect(result.cOpacity[0]).toBe(result.cOpacity[result.cOpacity.length - 1]);
      expect(result.cScale[0]).toBe(result.cScale[result.cScale.length - 1]);

      // Opacity bounds match min and max
      expect(Math.min(...result.cOpacity)).toBeCloseTo(minOp, 2);
      expect(Math.max(...result.cOpacity)).toBeCloseTo(maxOp, 2);
    });
  });
});
