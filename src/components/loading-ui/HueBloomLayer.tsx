/**
 * Reusable radial gradient bloom SVG layer for ambient hue loading effects.
 */

import React from 'react';
import Svg, {
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { hueStops } from '../hue';

export type HueBloomLayerProps = {
  svgW: number;
  svgH: number;
  gradId: string;
  color: string;
  stopStrength: number;
  rxRatio: number;
  ryRatio: number;
};

export const HueBloomLayer: React.FC<HueBloomLayerProps> = React.memo(({
  svgW,
  svgH,
  gradId,
  color,
  stopStrength,
  rxRatio,
  ryRatio,
}) => {
  const rxPercent = `${Math.round(rxRatio * 100)}%`;
  const ryPercent = `${Math.round(ryRatio * 100)}%`;

  return (
    <Svg width={svgW} height={svgH}>
      <Defs>
        <RadialGradient id={gradId} cx="50%" cy="50%" rx={rxPercent} ry={ryPercent}>
          {hueStops(stopStrength).map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={color}
              stopOpacity={stop.opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Ellipse
        cx={svgW * 0.5}
        cy={svgH * 0.5}
        rx={svgW * rxRatio}
        ry={svgH * ryRatio}
        fill={`url(#${gradId})`}
      />
    </Svg>
  );
});

HueBloomLayer.displayName = 'HueBloomLayer';
