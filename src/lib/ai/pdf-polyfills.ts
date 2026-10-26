/**
 * Minimal polyfills for pdfjs-dist when running in serverless environments
 * (e.g., Vercel) that lack @napi-rs/canvas native bindings.
 *
 * These stubs satisfy the DOMMatrix, Path2D, and ImageData constructors
 * that pdfjs-dist invokes at module load time (e.g., `const SCALE_MATRIX = new DOMMatrix()`).
 *
 * Since we only use text extraction (getText / getTextContent), the actual rendering
 * codepaths are never executed, so these no-op stubs are safe.
 *
 * IMPORTANT: This file MUST be imported before any import of 'pdf-parse' or 'pdfjs-dist'.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: any) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
        this.isIdentity = false;
      }
    }

    scaleSelf(sx = 1, sy = sx) {
      this.a *= sx;
      this.b *= sx;
      this.c *= sy;
      this.d *= sy;
      this.m11 = this.a;
      this.m12 = this.b;
      this.m21 = this.c;
      this.m22 = this.d;
      this.isIdentity = false;
      return this;
    }
    translateSelf(tx = 0, ty = 0) {
      this.e += this.a * tx + this.c * ty;
      this.f += this.b * tx + this.d * ty;
      this.m41 = this.e;
      this.m42 = this.f;
      this.isIdentity = false;
      return this;
    }
    rotateSelf() { return this; }
    multiplySelf() { return this; }
    preMultiplySelf() { return this; }
    invertSelf() { return this; }
    setMatrixValue() { return this; }
    inverse() { return new (globalThis as any).DOMMatrix(); }
    multiply() { return new (globalThis as any).DOMMatrix(); }
    translate(tx = 0, ty = 0) {
      const copy = new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
      return copy.translateSelf(tx, ty);
    }
    scale(sx = 1, sy = sx) {
      const copy = new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
      return copy.scaleSelf(sx, sy);
    }
    rotate() { return new (globalThis as any).DOMMatrix(); }
    transformPoint(p: any) { return p || { x: 0, y: 0, z: 0, w: 1 }; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
    toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
  } as any;
}

if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor(_d?: any) {}
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
    roundRect() {}
  } as any;
}

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = 'srgb';

    constructor(widthOrData: any, heightOrWidth?: number, height?: number) {
      if (widthOrData instanceof Uint8ClampedArray) {
        this.data = widthOrData;
        this.width = heightOrWidth || 0;
        this.height = height || 0;
      } else {
        this.width = widthOrData || 0;
        this.height = heightOrWidth || 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  } as any;
}
