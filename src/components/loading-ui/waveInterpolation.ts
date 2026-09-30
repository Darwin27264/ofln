/**
 * Mathematical keyframe interpolation helpers for HueLoadingIndicator.
 * Precomputes continuous harmonic sinusoidal and cosine curves for smooth GPU animation.
 */

export type WaveKeyframeData = {
  inputRange: number[];
  rangeX: number[];
  rangeY: number[];
  rangeScale: number[];
  rangeOpacity: number[];
};

/**
 * Computes seamless left-to-right wave keyframes with zero boundary jumps.
 * Wrap occurs at zero opacity, making the reset completely invisible to the eye.
 */
export function buildLeftToRightWave(
  phaseOffset: number,
  travelDist: number,
  maxTy: number,
  minScale: number,
  maxScale: number,
  maxOpacity: number,
): WaveKeyframeData {
  const SAMPLES = 32;
  const steps: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    steps.push(i / SAMPLES);
  }

  // Wrap occurs when (p + phaseOffset) reaches 1.0.
  // Add fine guard points immediately before and after wrap point so opacity is 0 during reset.
  const wrapP = (1.0 - phaseOffset + 1.0) % 1.0;
  if (wrapP > 0.001 && wrapP < 0.999) {
    steps.push(wrapP - 0.0001);
    steps.push(wrapP + 0.0001);
  }
  if (phaseOffset === 0) {
    steps.push(0.9999);
  }

  steps.sort((a, b) => a - b);
  const uniqueSteps = steps.filter((v, idx) => idx === 0 || v - steps[idx - 1] > 0.00005);

  const inputRange: number[] = [];
  const rangeX: number[] = [];
  const rangeY: number[] = [];
  const rangeScale: number[] = [];
  const rangeOpacity: number[] = [];

  for (const p of uniqueSteps) {
    inputRange.push(p);

    let localP = p + phaseOffset;
    if (localP >= 1.0 && p < wrapP) localP -= 1.0;
    else if (localP > 1.0) localP -= 1.0;
    if (p === 1.0 && phaseOffset === 0) localP = 1.0;
    if (Math.abs(p - (wrapP - 0.0001)) < 0.00001) localP = 1.0;
    if (Math.abs(p - (wrapP + 0.0001)) < 0.00001) localP = 0.0;

    // Travel exclusively from -travelDist (left) to +travelDist (right)
    const x = -travelDist + 2 * travelDist * localP;
    rangeX.push(Math.round(x * 100) / 100);

    // Subtle harmonic vertical float
    const y = maxTy * Math.sin(2 * Math.PI * localP);
    rangeY.push(Math.round(y * 100) / 100);

    // Smooth bell-shaped opacity window: 0 at left edge, peak in center, 0 at right edge
    const window = Math.pow(Math.sin(Math.PI * localP), 2);
    rangeOpacity.push(Math.round(maxOpacity * window * 1000) / 1000);

    // Harmonic breathing scale: expands in the center, contracts at edges
    const sc = minScale + (maxScale - minScale) * window;
    rangeScale.push(Math.round(sc * 1000) / 1000);
  }

  return { inputRange, rangeX, rangeY, rangeScale, rangeOpacity };
}

/**
 * Computes breathing pulse keyframes for the center resting bloom.
 */
export function buildCenterPulseKeyframes(
  minCenterOp: number,
  maxCenterOp: number,
): { cInput: number[]; cOpacity: number[]; cScale: number[] } {
  const SAMPLES = 16;
  const cInput: number[] = [];
  const cOpacity: number[] = [];
  const cScale: number[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const p = i / SAMPLES;
    cInput.push(p);
    const b = (1 - Math.cos(2 * Math.PI * p)) / 2;
    cOpacity.push(Math.round((minCenterOp + (maxCenterOp - minCenterOp) * b) * 1000) / 1000);
    cScale.push(Math.round((0.96 + 0.08 * b) * 1000) / 1000);
  }

  return { cInput, cOpacity, cScale };
}
