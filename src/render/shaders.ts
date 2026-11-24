/** GLSL sources. The panel hash must stay in sync with panelHash() in core/rng.ts. */

export const COMMON = /* glsl */ `
uniform float uSeed;
uniform float uLevel;
uniform float uTime;
uniform float uCeil;
uniform float uFlickerPulse;
uniform vec3 uPanelColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uOcc;
uniform vec4 uTintPos[8];
uniform vec3 uTintCol[8];
uniform vec3 uCamPos;
uniform vec3 uCamDir;
uniform float uNight;
uniform float uCaustic;
uniform float uLightScale;

uint hashP(ivec2 p) {
  uint h = (uint(p.x + 32768) * 73856093u) ^ (uint(p.y + 32768) * 19349663u) ^ (uint(uSeed) * 83492791u) ^ (uint(uLevel) * 2654435761u);
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;
  return h;
}

// Panel brightness: 0 dead, 0.55 dim, 1 normal; flickering panels follow the scheduler pulse.
float panelLevel(ivec2 p) {
  uint r = hashP(p) % 100u;
  if (r < 7u) return 0.0;
  if (r < 15u) return 0.55;
  if (r < 19u) return mix(1.0, 0.18, uFlickerPulse);
  return 1.0;
}

vec3 panelTint(vec2 pp) {
  for (int k = 0; k < 8; k++) {
    if (uTintPos[k].z > 0.5 && distance(uTintPos[k].xy, pp) < 0.2) return uTintCol[k];
  }
  return uPanelColor;
}

float occDim(vec2 pp) {
  float d = distance(pp, uOcc.xz);
  return mix(1.0, smoothstep(1.5, 7.0, d), uOcc.w);
}

vec3 lighting(vec3 wp, vec3 n) {
  vec2 g = (wp.xz - 1.0) / 4.0;
  ivec2 c = ivec2(floor(g + 0.5));
  vec3 acc = vec3(0.0);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 p = c + ivec2(dx, dz);
      vec2 pp = vec2(p) * 4.0 + 1.0;
      float lv = panelLevel(p);
      if (lv <= 0.0) continue;
      vec3 P = vec3(pp.x, uCeil - 0.03, pp.y);
      vec3 L = P - wp;
      float d2 = dot(L, L);
      float d = sqrt(d2);
      vec3 l = L / d;
      float ndl = max(dot(n, l), 0.0);
      float cosE = clamp(L.y / d, 0.0, 1.0);
      float att = 1.0 / (1.0 + 0.16 * d2);
      acc += panelTint(pp) * (lv * occDim(pp) * ndl * (0.3 + 0.7 * cosE) * att);
    }
  }
  vec3 amb = uAmbient * (0.75 + 0.25 * n.y) * mix(1.0, smoothstep(0.0, 8.0, distance(wp.xz, uOcc.xz)), uOcc.w * 0.6);
  // Night mode: the camcorder's infra-red lamp.
  if (uNight > 0.0) {
    vec3 L = uCamPos - wp;
    float d2 = dot(L, L);
    vec3 l = normalize(L);
    float cone = smoothstep(0.75, 0.95, dot(-l, uCamDir));
    acc += vec3(1.0) * uNight * max(dot(n, l), 0.0) * (0.4 + 0.6 * cone) * 6.0 / (1.0 + 0.25 * d2);
  }
  return (acc * 2.0 + amb) * uLightScale;
}

float caustic(vec2 p, float t) {
  float v = 0.0;
  v += sin(p.x * 3.1 + t * 0.9 + sin(p.y * 2.3 + t * 0.7) * 1.6);
  v += sin(p.y * 3.7 - t * 0.8 + sin(p.x * 2.9 - t * 0.6) * 1.4);
  v += sin((p.x + p.y) * 2.2 + t * 1.1);
  v = abs(v) / 3.0;
  return pow(1.0 - v, 5.0);
}

vec3 applyFog(vec3 col, vec3 wp) {
  float d = distance(wp, uCamPos);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

export const WORLD_VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aEmit;
varying vec3 vW;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = aCol;
  vEmit = aEmit;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const WORLD_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D map;
uniform float uMapScale;
uniform float uDamp;
varying vec3 vW;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
varying vec2 vUv;

void main() {
  vec3 n = normalize(vN);
  vec2 uvw;
  float an = abs(n.y);
  if (an > 0.5) {
    uvw = vW.xz;
  } else if (abs(n.x) > 0.5) {
    uvw = vec2(vW.z, vW.y);
  } else {
    uvw = vec2(vW.x, vW.y);
  }
#ifdef WALL
  // Slightly mis-tiled wallpaper: every 2 m strip is shifted by up to 1.5 cm.
  float strip = floor((uvw.x + 0.001) / 2.0);
  uvw.y += (fract(sin(strip * 12.9898 + uSeed) * 43758.5453) - 0.5) * 0.03;
#endif
#ifdef ATTR_UV
  vec2 tuv = vUv;
#else
  vec2 tuv = (uvw + vUv) / uMapScale;
#endif
  vec4 tx = texture2D(map, tuv);
  vec3 albedo = tx.rgb * vCol;
#ifdef WALL
  if (an < 0.5) {
    // Damp creeping up from the carpet, and grime under the ceiling.
    float damp = 1.0 - smoothstep(0.0, 0.45, vW.y);
    albedo *= mix(1.0, 0.62, damp * uDamp);
    albedo = mix(albedo, albedo * vec3(0.9, 0.82, 0.62), smoothstep(0.5, 0.0, vW.y) * uDamp);
    albedo *= mix(1.0, 0.85, smoothstep(uCeil - 0.4, uCeil, vW.y));
  }
#endif
  vec3 col;
  if (vEmit > 0.0) {
    col = albedo * vEmit;
  } else {
    col = albedo * lighting(vW, n);
  }
  if (uCaustic > 0.0 && vW.y > 0.32) {
    float k = caustic(vW.xz * 0.9 + vW.y * 0.2, uTime * 0.6);
    float w = smoothstep(0.32, 1.0, vW.y) * (0.5 + 0.5 * max(-n.y, 0.0));
    col += vec3(0.55, 0.85, 0.9) * k * uCaustic * w * 0.12;
  }
  col = applyFog(col, vW);
#ifdef DECAL
  gl_FragColor = vec4(col, tx.a);
  if (tx.a < 0.02) discard;
#else
  gl_FragColor = vec4(col, 1.0);
#endif
}
`;

export const PANEL_FRAG = /* glsl */ `
${COMMON}
varying vec3 vW;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
varying vec2 vUv;
void main() {
  // vCol carries the panel tint, vEmit its base level; uv.x marks flickering panels.
  float lv = vEmit;
  if (vUv.x > 0.5) lv = mix(1.0, 0.18, uFlickerPulse);
  lv *= occDim(vW.xz);
  // Diffuser: brighter centre, louvre lines.
  vec2 q = vUv.y > -1.0 ? fract(vW.xz * vec2(1.0, 1.0)) : vec2(0.0);
  float louvre = 0.88 + 0.12 * step(0.5, fract((vW.x + vW.z) * 6.0));
  vec3 col = vCol * lv * 2.6 * louvre + vec3(0.04, 0.04, 0.035);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
  if (q.x < -1.0) discard;
}
`;

export const CLOCK_FRAG = /* glsl */ `
${COMMON}
uniform float uClock;
varying vec3 vW;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
varying vec2 vUv;

float seg(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return 1.0 - smoothstep(w * 0.6, w, length(pa - ba * h));
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float t = uClock;
  if (vEmit > 0.5 && vEmit < 1.5) t = 86400.0 - mod(uClock * 1.0, 86400.0);
  if (vEmit > 1.5) t = uClock + 3600.0 * (3.0 + floor(vCol.r * 6.0)) + 1260.0;
  float sec = mod(t, 60.0);
  float mn = mod(t / 60.0, 60.0);
  float hr = mod(t / 3600.0, 12.0);
  float as = sec / 60.0 * 6.28318;
  float am = mn / 60.0 * 6.28318;
  float ah = hr / 12.0 * 6.28318;
  vec3 face = vec3(0.86, 0.84, 0.76);
  vec3 ink = vec3(0.08, 0.07, 0.06);
  vec3 col = face;
  col = mix(col, vec3(0.25, 0.24, 0.22), smoothstep(0.9, 0.93, r));
  for (int i = 0; i < 12; i++) {
    float a = float(i) / 12.0 * 6.28318;
    vec2 d = vec2(sin(a), cos(a));
    col = mix(col, ink, seg(p, d * 0.74, d * 0.84, i % 3 == 0 ? 0.05 : 0.025));
  }
  col = mix(col, ink, seg(p, vec2(0.0), vec2(sin(ah), cos(ah)) * 0.45, 0.06));
  col = mix(col, ink, seg(p, vec2(0.0), vec2(sin(am), cos(am)) * 0.68, 0.04));
  col = mix(col, vec3(0.6, 0.1, 0.08), seg(p, vec2(0.0), vec2(sin(as), cos(as)) * 0.72, 0.015));
  col *= lighting(vW, normalize(vN));
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const WATER_FRAG = /* glsl */ `
${COMMON}
varying vec3 vW;
void main() {
  vec2 p = vW.xz;
  float t = uTime;
  vec3 n = normalize(vec3(
    sin(p.x * 2.3 + t * 1.1) * 0.03 + sin(p.y * 3.7 - t * 0.7) * 0.02 + sin((p.x - p.y) * 5.0 + t * 1.7) * 0.012,
    1.0,
    cos(p.y * 2.1 - t * 0.9) * 0.03 + cos(p.x * 3.3 + t * 0.6) * 0.02));
  vec3 v = normalize(vW - uCamPos);
  vec3 r = reflect(v, n);
  float fres = 0.08 + 0.72 * pow(1.0 - max(dot(-v, n), 0.0), 4.0);
  vec3 refl = vec3(0.0);
  if (r.y > 0.01) {
    float k = (uCeil - vW.y) / r.y;
    vec2 hit = vW.xz + r.xz * k;
    vec2 g = (hit - 1.0) / 4.0;
    vec2 f = abs(fract(g + 0.5) - 0.5) * 4.0;
    ivec2 cell = ivec2(floor(g + 0.5));
    float lv = panelLevel(cell) * occDim(vec2(cell) * 4.0 + 1.0);
    float spot = (1.0 - smoothstep(0.25, 0.75, max(f.x * 0.5, f.y))) * lv;
    refl = panelTint(vec2(cell) * 4.0 + 1.0) * spot * 3.0 + vec3(0.5, 0.6, 0.62) * 0.18;
  }
  vec3 lit = lighting(vW, vec3(0.0, 1.0, 0.0));
  vec3 base = vec3(0.32, 0.55, 0.58) * lit * 0.35;
  vec3 col = mix(base, refl, fres);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 0.42 + fres * 0.45);
}
`;

export const OCC_VERT = /* glsl */ `
uniform float uTime;
uniform float uGlitch;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 p = position;
  float band = floor(p.y * 26.0 + uTime * 7.0);
  float j = fract(sin(band * 91.7 + floor(uTime * 12.0)) * 4375.85);
  p.x += (j - 0.5) * (0.05 + uGlitch * 0.25);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const OCC_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D map;
uniform float uNightOcc;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
uniform float uFogDensity;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  // Wallpaper that does not quite tile, crawling with video noise.
  vec2 uv = vec2(vW.x + vW.z, vW.y) * 1.07 + vec2(sin(uTime * 0.3) * 0.02, uTime * 0.01);
  vec3 wp = texture2D(map, uv).rgb;
  float n = fract(sin(dot(floor(vec2(gl_FragCoord.x * 0.5, gl_FragCoord.y) + uTime * 60.0), vec2(12.9898, 78.233))) * 43758.5453);
  float scan = 0.7 + 0.3 * sin(gl_FragCoord.y * 1.6 + uTime * 30.0);
  vec3 col = mix(wp * 0.22, vec3(n * 0.5), 0.45) * scan;
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(uCamPos - vW))), 2.0);
  col += vec3(0.35, 0.33, 0.25) * rim * 0.6;
  col = mix(col, vec3(0.8, 1.0, 0.8) * (0.4 + n * 0.6), uNightOcc * 0.7);
  float d = distance(vW, uCamPos);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d * 0.5);
  col = mix(col, uFogColor, f);
  if (n < 0.08) discard;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const TAPE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const TAPE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uCam;
uniform float uNight;
uniform float uReplay;
uniform float uTear;
uniform float uFlash;
uniform float uGrain;
uniform float uFilter;
uniform float uFade;
uniform float uStatic;
uniform vec2 uRes;
varying vec2 vUv;

float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  float lofi = max(uCam, uReplay);
  // Lens distortion in the camcorder view.
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 + dot(c, c) * 0.18 * lofi);
  // Tracking noise band and tear.
  float band = smoothstep(0.0, 0.02, abs(fract(uv.y * 0.7 - uTime * 0.11) - 0.5) - 0.47);
  float line = floor(uv.y * uRes.y * 0.5);
  float jit = (rnd(vec2(line, floor(uTime * 30.0))) - 0.5);
  uv.x += jit * 0.0025 * lofi + (1.0 - band) * 0.006 * lofi * jit;
  uv.x += uTear * (rnd(vec2(floor(uv.y * 40.0), floor(uTime * 20.0))) - 0.5) * 0.15;
  float ca = 0.0025 * lofi + uTear * 0.01;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
  // Chroma bleed: soften colour, keep luma.
  if (lofi > 0.0) {
    vec3 blur = texture2D(tDiffuse, uv + vec2(0.004, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.004, 0.0)).rgb;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 chroma = (blur * 0.5) - vec3(dot(blur * 0.5, vec3(0.299, 0.587, 0.114)));
    col = mix(col, vec3(l) + chroma * 0.85, 0.6 * lofi);
    col = (col - 0.5) * (1.0 + 0.12 * lofi) + 0.5;
    col *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.4);
    col += (1.0 - band) * 0.06 * lofi;
  }
  if (uNight > 0.0) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(0.25, 1.0, 0.35) * pow(l, 0.8) * 1.8, uNight);
  }
  if (uReplay > 0.0) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(l) * vec3(0.9, 1.0, 0.92), 0.75 * uReplay);
  }
  // Cosmetic filters: 1 sepia, 2 mono, 3 cold.
  if (uFilter > 0.5) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    if (uFilter < 1.5) col = mix(col, vec3(l) * vec3(1.1, 0.95, 0.75), 0.7);
    else if (uFilter < 2.5) col = vec3(l);
    else col = mix(col, vec3(l) * vec3(0.8, 0.95, 1.15), 0.6);
  }
  // Grain everywhere, stronger in the lens.
  float g = rnd(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5;
  col += g * (uGrain + 0.06 * lofi);
  // Vignette.
  float v = smoothstep(0.85, 0.25, length(c * vec2(1.0, 0.8)));
  col *= mix(0.72, 1.0, v);
  // Static (tape ending).
  if (uStatic > 0.0) {
    float s = rnd(floor(gl_FragCoord.xy * 0.5) + floor(uTime * 60.0));
    col = mix(col, vec3(s * 0.8), uStatic);
  }
  col = mix(col, vec3(1.0), uFlash);
  col *= 1.0 - uFade;
  // Humid, never pure black.
  col = max(col, vec3(0.012, 0.011, 0.008));
  gl_FragColor = vec4(col, 1.0);
}
`;
