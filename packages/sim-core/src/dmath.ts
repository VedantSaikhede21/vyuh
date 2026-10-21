// Engine-independent math for the sim (decision 111). JavaScript leaves Math.sin,
// Math.atan2, Math.exp, Math.log… implementation-defined, and Chrome's V8 and
// Node's V8 really do differ in the last bit (atan2 on ~18 % of inputs), so a
// session recorded in one would not replay exactly in the other. These are
// ports of Sun's fdlibm (the classic freely distributable libm, © 1993 Sun
// Microsystems; "permission to use, copy, modify, and distribute this software
// is freely granted, provided that this notice is preserved"), using only + − × ÷
// and bit access, which IEEE 754 makes exact and identical everywhere.
// Accuracy is fdlibm's: under 1 ulp. sqrt, hypot and floor are already exact.

const view = new DataView(new ArrayBuffer(8));

function hiWord(x: number): number {
  view.setFloat64(0, x);
  return view.getInt32(0);
}

function loWord(x: number): number {
  view.setFloat64(0, x);
  return view.getUint32(4);
}

function fromWords(hi: number, lo: number): number {
  view.setInt32(0, hi | 0);
  view.setUint32(4, lo >>> 0);
  return view.getFloat64(0);
}

// ---- sin / cos (k_sin.c, k_cos.c, e_rem_pio2.c medium range) -------------------

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

function kernelSin(x: number, y: number, iy: 0 | 1): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function kernelCos(x: number, y: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1; // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;
/** fdlibm's medium-range reduction is exact up to 2^19 · π/2; the sim never comes close. */
const MAX_REDUCE = 823549.6;

/** x = n·π/2 + (y0 + y1), |y0 + y1| ≤ π/4. */
function remPio2(x: number): [n: number, y0: number, y1: number] {
  const t0 = Math.abs(x);
  if (!(t0 <= MAX_REDUCE)) throw new RangeError(`dmath: angle ${x} out of range`);
  const ix = hiWord(x) & 0x7fffffff;
  const n = Math.floor(t0 * INV_PIO2 + 0.5);
  let r = t0 - n * PIO2_1;
  let w = n * PIO2_1T;
  const j = ix >> 20;
  let y0 = r - w;
  let i = j - ((hiWord(y0) >> 20) & 0x7ff);
  if (i > 16) {
    let t = r;
    w = n * PIO2_2;
    r = t - w;
    w = n * PIO2_2T - (t - r - w);
    y0 = r - w;
    i = j - ((hiWord(y0) >> 20) & 0x7ff);
    if (i > 49) {
      t = r;
      w = n * PIO2_3;
      r = t - w;
      w = n * PIO2_3T - (t - r - w);
      y0 = r - w;
    }
  }
  const y1 = r - y0 - w;
  return x < 0 ? [-n, -y0, -y1] : [n, y0, y1];
}

export function dsin(x: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
  if (ix >= 0x7ff00000) return NaN;
  const [n, y0, y1] = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelSin(y0, y1, 1);
    case 1:
      return kernelCos(y0, y1);
    case 2:
      return -kernelSin(y0, y1, 1);
    default:
      return -kernelCos(y0, y1);
  }
}

export function dcos(x: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  if (ix >= 0x7ff00000) return NaN;
  const [n, y0, y1] = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelCos(y0, y1);
    case 1:
      return -kernelSin(y0, y1, 1);
    case 2:
      return -kernelCos(y0, y1);
    default:
      return kernelSin(y0, y1, 1);
  }
}

/** sin / cos, both deterministic (≤ 2 ulp; only used for small FOV angles). */
export function dtan(x: number): number {
  return dsin(x) / dcos(x);
}

// ---- atan / atan2 (s_atan.c, e_atan2.c) ----------------------------------------

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
] as const;
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
] as const;
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2,
] as const;

export function datan(x0: number): number {
  const hx = hiWord(x0);
  const ix = hx & 0x7fffffff;
  if (Number.isNaN(x0)) return NaN;
  if (ix >= 0x44100000) return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  let x = x0;
  let id: -1 | 0 | 1 | 2 | 3;
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) return x; // |x| < 2^-29
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const k = id as 0 | 1 | 2 | 3;
  const r = ATAN_HI[k] - (x * (s1 + s2) - ATAN_LO[k] - x);
  return hx < 0 ? -r : r;
}

const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;
const PI_O_2 = 1.5707963267948966;

export function datan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  // Infinite arguments give exact constants in every engine.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Math.atan2(y, x);
  if (x === 1) return datan(y);
  const hx = hiWord(x);
  const hy = hiWord(y);
  const ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  const m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);
  if (y === 0) {
    if (m < 2) return y; // atan(±0, +x) = ±0
    return m === 2 ? PI : -PI;
  }
  if (x === 0) return hy < 0 ? -PI_O_2 : PI_O_2;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (hx < 0 && k < -60) z = 0;
  else z = datan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

// ---- exp / log (e_exp.c, e_log.c) ------------------------------------------------

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;
const TWO_M1000 = 9.3326361850321887899e-302;

export function dexp(x0: number): number {
  let x = x0;
  let hx = hiWord(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  if (hx >= 0x40862e42) {
    if (Number.isNaN(x)) return NaN;
    if (x === Infinity) return Infinity;
    if (x === -Infinity) return 0;
    if (x > O_THRESHOLD) return Infinity;
    if (x < U_THRESHOLD) return 0;
  }
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = x - (xsb ? -LN2_HI : LN2_HI);
      lo = xsb ? -LN2_LO : LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INV_LN2 * x + (xsb ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) return fromWords(hiWord(y) + (k << 20), loWord(y));
  return fromWords(hiWord(y) + ((k + 1000) << 20), loWord(y)) * TWO_M1000;
}

const TWO54 = 1.8014398509481984e16;
const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

export function dlog(x0: number): number {
  let x = x0;
  let hx = hiWord(x);
  const lx = loWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54; // subnormal: scale up
    hx = hiWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  x = fromWords(hx | (i ^ 0x3ff00000), loWord(x)); // normalise x or x/2
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;
    const r = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - r : k * LN2_HI - (r - k * LN2_LO - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  let ii = hx - 0x6147a;
  const w = z * z;
  const jj = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  ii |= jj;
  const r = t2 + t1;
  if (ii > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0
      ? f - (hfsq - s * (hfsq + r))
      : k * LN2_HI - (hfsq - (s * (hfsq + r) + k * LN2_LO) - f);
  }
  return k === 0 ? f - s * (f - r) : k * LN2_HI - (s * (f - r) - k * LN2_LO - f);
}

const LN10 = 2.302585092994046;

export function dlog10(x: number): number {
  return dlog(x) / LN10;
}

/** b^e for b > 0 (radar rain attenuation): exp(e · ln b). */
export function dpow(b: number, e: number): number {
  if (b === 0) return e > 0 ? 0 : Infinity;
  if (!(b > 0)) throw new RangeError(`dmath: dpow needs a positive base, got ${b}`);
  return dexp(e * dlog(b));
}

/** Degrees ↔ radians, kept here so every angle in the sim goes one way. */
export const DEG = PI / 180;
