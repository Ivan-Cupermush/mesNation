import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from 'react-native-svg';
import { MessagesSquare } from 'lucide-react-native';

// Ядро генератора без рендеров под Node/canvas — чистый JS, работает в Hermes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCodeCore: { create: (text: string, opts: { errorCorrectionLevel: string }) => { modules: { size: number; get: (r: number, c: number) => number } } } = require('qrcode/lib/core/qrcode');

/**
 * QR-код в стиле Telegram: круглые точки с градиентом, скруглённые «глазки»
 * по углам и фирменный знак в центре. Уровень коррекции H — код читается,
 * хотя середина закрыта значком.
 */

export interface QrMatrix {
  size: number;
  dark: (r: number, c: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const m = QRCodeCore.create(text, { errorCorrectionLevel: 'H' }).modules;
  return { size: m.size, dark: (r, c) => !!m.get(r, c) };
}

/** Модули под «глазками» (7×7 по трём углам) рисуются отдельно. */
const inFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

export function qrPaths(m: QrMatrix, cell: number, holeModules: number) {
  const n = m.size;
  const lo = Math.floor((n - holeModules) / 2);
  const hi = lo + holeModules;
  const r = cell * 0.43;
  let dots = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!m.dark(row, col) || inFinder(row, col, n)) continue;
      if (row >= lo && row < hi && col >= lo && col < hi) continue;
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      dots += `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
    }
  }
  // «Глазок»: скруглённая рамка 7×7 и квадрат 3×3 внутри.
  const eye = (x: number, y: number) => {
    const s = 7 * cell;
    const outerR = cell * 2.2;
    const innerR = cell * 1.35;
    const t = cell;
    const ring =
      roundRect(x, y, s, s, outerR) + roundRect(x + t, y + t, s - 2 * t, s - 2 * t, Math.max(0, outerR - t * 0.9), true);
    const pupil = roundRect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell, innerR * 0.75);
    return ring + pupil;
  };
  const eyes = eye(0, 0) + eye((n - 7) * cell, 0) + eye(0, (n - 7) * cell);
  return { dots, eyes, holeStart: lo * cell, holeSize: holeModules * cell };
}

/** Путь скруглённого прямоугольника; reverse — против часовой (вырез в рамке при evenodd). */
function roundRect(x: number, y: number, w: number, h: number, rad: number, reverse = false) {
  const r = Math.min(rad, w / 2, h / 2);
  const f = (v: number) => v.toFixed(2);
  if (!reverse) {
    return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
  }
  return `M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 0 0 ${f(x)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + r)} ${f(y + h)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + w)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + w - r)} ${f(y)}Z`;
}

export default function QrCode({
  value,
  size,
  colors,
  logoColor,
  background = '#FFFFFF',
}: {
  value: string;
  size: number;
  /** Градиент точек: сверху-слева → снизу-справа. */
  colors: [string, string];
  logoColor?: string;
  background?: string;
}) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const n = matrix.size;
  const cell = size / n;
  // Середина под значок — около 22% стороны, нечётное число модулей, чтобы было по центру.
  const hole = useMemo(() => {
    let h = Math.round(n * 0.22);
    if (h % 2 !== n % 2) h += 1;
    return h;
  }, [n]);
  const paths = useMemo(() => qrPaths(matrix, cell, hole), [matrix, cell, hole]);
  const logo = paths.holeSize * 0.84;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="qrFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={background} />
        <Path d={paths.dots} fill="url(#qrFill)" />
        <Path d={paths.eyes} fill="url(#qrFill)" fillRule="evenodd" />
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: (size - logo) / 2,
          top: (size - logo) / 2,
          width: logo,
          height: logo,
          borderRadius: logo * 0.3,
          backgroundColor: logoColor || colors[0],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MessagesSquare size={logo * 0.52} color="#FFFFFF" strokeWidth={2.2} />
      </View>
    </View>
  );
}
