import * as THREE from 'three';

// ============================================================
// SHARED GLSL LIBRARY — Noise, utilities, lighting helpers
// ============================================================
const NOISE_LIB = `
  // --- Permutation helpers ---
  vec3 mod289_3(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289_2(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289_4(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute3(vec3 x) { return mod289_3(((x*34.0)+1.0)*x); }
  vec4 permute4(vec4 x) { return mod289_4(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  // --- 2D Simplex noise ---
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289_2(i);
    vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // --- 3D Simplex noise ---
  float snoise3(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289_3(i);
    vec4 p = permute4(permute4(permute4(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // --- Voronoi / Worley noise ---
  vec2 voronoi(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float md = 8.0;
    vec2 mr;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(
          fract(sin(dot(n + g, vec2(127.1, 311.7))) * 43758.5453),
          fract(sin(dot(n + g, vec2(269.5, 183.3))) * 43758.5453)
        );
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; }
      }
    }
    return vec2(sqrt(md), length(mr));
  }

  // --- FBM (Fractal Brownian Motion) ---
  float fbm(vec2 p, int octaves) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      val += amp * snoise(p * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  float fbm3(vec3 p, int octaves) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      val += amp * snoise3(p * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  // --- Blackbody radiation approximation ---
  // Maps temperature (0-1 normalized) to physically-plausible color
  vec3 blackbody(float t) {
    // Based on Planck's law approximation
    vec3 c;
    t = clamp(t, 0.0, 1.0) * 6500.0 + 500.0; // map to ~500K - 7000K
    // Red channel
    if (t < 6600.0) c.r = 1.0;
    else c.r = clamp(1.292936 * pow(t/100.0 - 60.0, -0.1332047592), 0.0, 1.0);
    // Green channel
    if (t < 6600.0) c.g = clamp(0.39008158 * log(t/100.0) - 0.63184144, 0.0, 1.0);
    else c.g = clamp(1.129891 * pow(t/100.0 - 60.0, -0.0755148492), 0.0, 1.0);
    // Blue channel
    if (t >= 6600.0) c.b = 1.0;
    else if (t < 2000.0) c.b = 0.0;
    else c.b = clamp(0.54320679 * log(t/100.0 - 10.0) - 1.19625409, 0.0, 1.0);
    return c;
  }

  // === ADVANCED NOISE TOOLBOX (planet shaders) ============================

  // Quick 3D hash -- pseudo-random vec3 in [0,1] from a vec3 seed.
  vec3 hash33(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  // 3D Voronoi (Worley) noise -- distance to nearest cell point.
  // Returns vec2(F1, F2) where F1 is nearest, F2 is second-nearest.
  // Use F2-F1 for cell BORDERS, F1 for cell distance.
  vec2 voronoi3(vec3 p) {
    vec3 b = floor(p);
    vec3 f = fract(p);
    float F1 = 8.0;
    float F2 = 8.0;
    for (int z = -1; z <= 1; z++) {
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 r = g + hash33(b + g) - f;
          float d = dot(r, r);
          if (d < F1) { F2 = F1; F1 = d; }
          else if (d < F2) { F2 = d; }
        }
      }
    }
    return vec2(sqrt(F1), sqrt(F2));
  }

  // Ridged noise -- 1 - |snoise| produces sharp ridges where the noise
  // crosses zero. Ideal for lava cracks, mountain ridges, plasma flows.
  float ridged3(vec3 p) {
    return 1.0 - abs(snoise3(p));
  }

  // Domain warping -- perturb the input coordinates by a vector noise
  // field before sampling. Turns regular FBM into swirly, organic,
  // "fluid-like" patterns. Higher strength = more chaotic warp.
  vec3 warpDomain(vec3 p, float strength, float scale) {
    vec3 q = vec3(
      snoise3(p * scale),
      snoise3((p + vec3(5.2, 1.3, 8.4)) * scale),
      snoise3((p + vec3(2.8, 7.1, 3.6)) * scale)
    );
    return p + q * strength;
  }
`;

// ============================================================
// 1. STYLIZED TERRAIN SHADER — SC2 Char tileset style
//    Hard color bands, 2-step lava ramp, dark outlines,
//    hand-painted feel. Per-planet color palettes.
// ============================================================
// Planet terrain styles:
// 0 = Volcanic (Ignisium) — orange lava cracks
// 1 = Crystal Ice (Crystara) — blue-white cryo fissures
// 2 = Temperate (Verdania) — green bioluminescent veins
// 3 = Gas Giant (Nethara) — amber chemical vents
// 4 = Frozen (Glacius) — pale cyan frost cracks
export function createLavaShader(planetStyle = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStyle: { value: planetStyle },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      varying vec3 vNormal;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStyle;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      varying vec3 vNormal;

      ${NOISE_LIB}

      // Animated Voronoi — drives the crack pattern
      vec3 aVoronoi(vec2 x, float t) {
        vec2 n = floor(x), f = fract(x);
        float md = 8.0, md2 = 8.0;
        for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(
              fract(sin(dot(n+g, vec2(127.1,311.7))) * 43758.5453),
              fract(sin(dot(n+g, vec2(269.5,183.3))) * 43758.5453));
            o = 0.5 + 0.3 * sin(t * 0.15 + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < md) { md2 = md; md = d; }
            else if (d < md2) { md2 = d; }
          }
        return vec3(sqrt(md), sqrt(md2), sqrt(md2) - sqrt(md));
      }

      // Hard step — the key to the stylized look. Not smoothstep.
      float hardStep(float edge, float x) {
        return step(edge, x);
      }

      // 3-band color ramp (dark/mid/light) with hard transitions
      vec3 bandedColor(float val, vec3 dark, vec3 mid, vec3 light) {
        vec3 c = dark;
        c = mix(c, mid, hardStep(0.35, val));
        c = mix(c, light, hardStep(0.65, val));
        return c;
      }

      // Per-planet palettes
      // rockDark, rockMid, rockLight, lavaDeep, lavaBright, outlineColor, rimColor
      void getPlanetPalette(float style,
        out vec3 rD, out vec3 rM, out vec3 rL,
        out vec3 lD, out vec3 lB,
        out vec3 outl, out vec3 rimC) {
        if (style < 0.5) {
          // Volcanic — SC2 Char
          rD = vec3(0.08, 0.07, 0.09);
          rM = vec3(0.22, 0.20, 0.24);
          rL = vec3(0.38, 0.35, 0.40);
          lD = vec3(0.6, 0.08, 0.0);
          lB = vec3(1.0, 0.65, 0.1);
          outl = vec3(0.02, 0.01, 0.01);
          rimC = vec3(0.5, 0.15, 0.0);
        } else if (style < 1.5) {
          // Crystal Ice
          rD = vec3(0.06, 0.08, 0.18);
          rM = vec3(0.15, 0.20, 0.35);
          rL = vec3(0.30, 0.38, 0.55);
          lD = vec3(0.05, 0.15, 0.5);
          lB = vec3(0.5, 0.8, 1.0);
          outl = vec3(0.01, 0.02, 0.06);
          rimC = vec3(0.2, 0.4, 0.8);
        } else if (style < 2.5) {
          // Temperate — bioluminescent
          rD = vec3(0.06, 0.10, 0.05);
          rM = vec3(0.14, 0.22, 0.12);
          rL = vec3(0.28, 0.38, 0.22);
          lD = vec3(0.0, 0.3, 0.05);
          lB = vec3(0.3, 1.0, 0.3);
          outl = vec3(0.01, 0.04, 0.01);
          rimC = vec3(0.1, 0.5, 0.1);
        } else if (style < 3.5) {
          // Gas Giant — chemical amber
          rD = vec3(0.12, 0.08, 0.04);
          rM = vec3(0.28, 0.20, 0.10);
          rL = vec3(0.45, 0.35, 0.18);
          lD = vec3(0.5, 0.2, 0.0);
          lB = vec3(1.0, 0.75, 0.2);
          outl = vec3(0.04, 0.02, 0.0);
          rimC = vec3(0.6, 0.3, 0.05);
        } else {
          // Frozen — pale frost
          rD = vec3(0.10, 0.12, 0.18);
          rM = vec3(0.22, 0.28, 0.38);
          rL = vec3(0.40, 0.48, 0.58);
          lD = vec3(0.1, 0.2, 0.4);
          lB = vec3(0.6, 0.85, 1.0);
          outl = vec3(0.02, 0.03, 0.06);
          rimC = vec3(0.3, 0.5, 0.7);
        }
      }

      void main() {
        vec2 uv = vWorldPos.xz * 0.04;
        float t = uTime * 0.03;

        // === VORONOI CRACK PATTERN (one pass) ===
        vec3 v = aVoronoi(uv * 2.5, uTime);
        float edge = v.z; // crack edge distance

        // Crack mask — hard edge, not smooth
        float crackMask = 1.0 - hardStep(0.06, edge);

        // Wider glow zone around cracks (slight softness for readability)
        float glowZone = 1.0 - smoothstep(0.0, 0.14, edge);

        // === DARK OUTLINE at rock/lava boundary ===
        float outline = smoothstep(0.04, 0.06, edge) * (1.0 - smoothstep(0.06, 0.10, edge));

        // === FLOW ANIMATION (cheap, one noise call) ===
        float flow = snoise(uv * 1.2 + t * 0.5) * 0.5 + 0.5;
        float pulse = sin(uTime * 0.3 + flow * 4.0) * 0.15 + 0.85;

        // === ROCK: 3 hard bands based on Voronoi cell distance ===
        float rockVal = v.x; // distance to nearest cell center
        // Add slight noise to break up the bands (hand-painted feel)
        rockVal += snoise(uv * 6.0) * 0.12;

        // === GET PLANET PALETTE ===
        vec3 rD, rM, rL, lD, lB, outl, rimC;
        getPlanetPalette(uStyle, rD, rM, rL, lD, lB, outl, rimC);

        // === ROCK COLOR: hard 3-band ===
        vec3 rockColor = bandedColor(rockVal, rD, rM, rL);

        // === LAVA COLOR: 2-step ramp (deep center → bright edge) ===
        float lavaEdge = smoothstep(0.0, 0.05, edge); // 0 at crack center, 1 at edge
        vec3 lavaColor = mix(lB, lD, lavaEdge); // bright center, deep at edges
        lavaColor *= pulse; // subtle animation

        // === DARK OUTLINE ===
        vec3 outlineColor = outl;

        // === COMPOSITE ===
        vec3 color = rockColor;

        // Apply outline ring (dark band between rock and lava)
        color = mix(color, outlineColor, outline * 0.8);

        // Apply lava in cracks
        color = mix(color, lavaColor, crackMask);

        // Subtle glow bleed from lava onto nearby rock
        color += rimC * glowZone * (1.0 - crackMask) * 0.25 * pulse;

        // === STRONG RIM LIGHTING (SC2 style — pops silhouettes) ===
        float rim = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.5);
        color += rimC * rim * 0.4;

        // === CONTRAST BOOST (Blizzard style — punchy darks/lights) ===
        color = pow(color, vec3(0.9)); // slight gamma push
        color *= 1.15; // exposure boost
        color = clamp(color, 0.0, 1.4);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// ============================================================
// 2. SUN SHADER — Turbulent convection + prominences
// ============================================================
export function createSunShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewDir;

      ${NOISE_LIB}

      void main() {
        float t = uTime * 0.15;
        vec3 p = vPosition * 0.4;

        // Convection cells using domain-warped 3D noise
        float n1 = fbm3(p + vec3(t * 0.3, t * 0.1, t * 0.2), 5);
        float n2 = fbm3(p * 1.5 + vec3(-t * 0.2, t * 0.4, -t * 0.15), 4);
        float n3 = fbm3(p * 0.8 + vec3(n1, n2, t * 0.1), 4);

        float turb = n3 * 0.5 + 0.5;

        // Granulation pattern (small convection cells)
        vec2 gran = voronoi(vPosition.xy * 2.0 + t * 0.2);
        float granulation = smoothstep(0.1, 0.3, gran.x) * 0.15;

        // Sunspots (dark, cooler regions)
        float spots = snoise(p * 0.3 + t * 0.05);
        spots = smoothstep(0.5, 0.7, spots) * 0.35;

        // Temperature field
        float temp = turb - spots + granulation;
        temp = clamp(temp, 0.0, 1.0);

        // Bright, vibrant solar coloring
        vec3 deepOrange = vec3(1.0, 0.4, 0.05);
        vec3 warmYellow = vec3(1.0, 0.85, 0.3);
        vec3 hotCenter = vec3(1.0, 0.95, 0.7);

        vec3 color = mix(deepOrange, warmYellow, temp);
        color = mix(color, hotCenter, pow(temp, 2.0));

        // Magnetic field bright regions
        float magnetic = pow(max(turb - 0.3, 0.0), 3.0);
        color += vec3(1.0, 0.9, 0.5) * magnetic * 0.6;

        // Limb darkening (gentler so edges are still visible)
        float mu = max(dot(vNormal, vViewDir), 0.0);
        float limbDark = 0.5 + 0.5 * pow(mu, 0.4);
        color *= limbDark;

        // Allow the sun to be bright (it's supposed to glow)
        color = min(color, vec3(1.5));

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// ============================================================
// 3. ATMOSPHERE SHADER — Multi-scatter Fresnel approximation
// ============================================================
export function createAtmosphereShader(color = new THREE.Color(0xff4400), intensity = 0.8) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uIntensity: { value: intensity },
      uFalloff: { value: 3.0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uFalloff;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        // Multi-scatter approximation: two falloff curves blended
        float inner = pow(fresnel, uFalloff) * uIntensity;
        float outer = pow(fresnel, uFalloff * 0.4) * uIntensity * 0.5;
        float glow = inner + outer;

        // Subtle atmospheric shimmer
        float shimmer = sin(vWorldPos.y * 10.0 + uTime * 2.0) * 0.05 + 1.0;
        glow *= shimmer;

        // Brighter, more visible glow
        vec3 col = uColor * glow * 1.5;
        float alpha = clamp(glow, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ============================================================
// 3b. PLANET (triplanar projection) — wraps a square MJ marble
//     onto a sphere without UV stretch/pole pinching by sampling
//     the texture from 3 orthogonal planes and blending by the
//     surface normal. Used for the solar-system view planets.
// ============================================================
export function createPlanetShader(texture, radius = 5.0, opts = {}) {
  const {
    lightDir = new THREE.Vector3(1, 0, 0),
    // Defaults chosen so an unlit dark side still reads at ~70% of the
    // sunlit brightness -- you should always be able to recognize a
    // planet in an overview shot, lighting is for flavor not gameplay.
    ambient = new THREE.Vector3(0.45, 0.45, 0.55),
    sunColor = new THREE.Vector3(0.80, 0.75, 0.70),
    brightness = 1.2,
    sharpness = 4.0,
    wrap = 0.5,  // 0 = standard lambert; 0.5 = half-lambert (recommended)
    emissive = new THREE.Color(0x000000),
    emissiveIntensity = 0.0,
    // 'triplanar' (default) blends 3 axial samples -- ideal for noisy
    //   surfaces where sticker repetition is invisible.
    // 'equirect' wraps the texture once around the sphere using standard
    //   spherical UV mapping -- right for textures with strong directional
    //   structure (gas-giant bands, swirling clouds) where triplanar's
    //   3-copy effect is jarring. Has one back-seam + pole pinching as
    //   inherent costs.
    mapping = 'triplanar',
    // For 'equirect' only: how much of the texture's vertical range to
    // actually sample. MJ marbles have a black background filling the
    // corners; sampling the full y range bleeds that black into the
    // planet's polar caps. vRange=0.6 means "only sample the middle 60%
    // of the texture vertically" -- the marble's actual content -- and
    // stretch it across the whole sphere. Same for uRange (horizontal,
    // for marbles where the orb doesn't fill side-to-side).
    vRange = 1.0,
    uRange = 1.0,
  } = opts;

  // The texture-sampling step is the only thing that differs between
  // mapping modes; the lighting math is shared.
  const samplerCode = mapping === 'equirect' ? `
      vec3 sampleSurface() {
        vec3 n = normalize(vLocalNormal);
        // atan(x, z) so that lon=0 (u=0.5) corresponds to the +Z direction
        // -- which is the convention used by install_textures.spherify
        // when generating the equirect map. Any other arg order rotates
        // the marble's "front view" off the camera-facing side.
        float u = atan(n.x, n.z) / (2.0 * 3.14159265) + 0.5;
        float v = asin(clamp(n.y, -1.0, 1.0)) / 3.14159265 + 0.5;
        // Optional sample-range compression (defaults 1.0 = no clamp).
        u = (u - 0.5) * uURange + 0.5;
        v = (v - 0.5) * uVRange + 0.5;
        return texture2D(uTexture, vec2(u, v)).rgb;
      }
  ` : `
      vec3 sampleAxis(vec2 planeCoords) {
        vec2 uv = planeCoords / (2.0 * uRadius) + 0.5;
        return texture2D(uTexture, uv).rgb;
      }
      vec3 sampleSurface() {
        vec3 blend = pow(abs(vLocalNormal), vec3(uSharpness));
        blend /= max(dot(blend, vec3(1.0)), 0.0001);
        vec3 sampX = sampleAxis(vLocalPos.yz);
        vec3 sampY = sampleAxis(vLocalPos.xz);
        vec3 sampZ = sampleAxis(vLocalPos.xy);
        return sampX * blend.x + sampY * blend.y + sampZ * blend.z;
      }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture:           { value: texture },
      uRadius:            { value: radius },
      uLightDir:          { value: lightDir.clone().normalize() },
      uAmbient:           { value: ambient },
      uSunColor:          { value: sunColor },
      uBrightness:        { value: brightness },
      uSharpness:         { value: sharpness },
      uWrap:              { value: wrap },
      uEmissive:          { value: emissive },
      uEmissiveIntensity: { value: emissiveIntensity },
      uTime:              { value: 0 },
      uVRange:            { value: vRange },
      uURange:            { value: uRange },
    },
    vertexShader: `
      varying vec3 vLocalPos;     // object-space (texture sticks to planet)
      varying vec3 vLocalNormal;  // object-space normal for triplanar blend
      varying vec3 vWorldNormal;  // world-space normal for lighting
      void main() {
        vLocalPos = position;
        vLocalNormal = normal;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform float uRadius;
      uniform vec3 uLightDir;
      uniform vec3 uAmbient;
      uniform vec3 uSunColor;
      uniform float uBrightness;
      uniform float uSharpness;
      uniform float uWrap;
      uniform vec3 uEmissive;
      uniform float uEmissiveIntensity;
      uniform float uTime;
      uniform float uVRange;
      uniform float uURange;
      varying vec3 vLocalPos;
      varying vec3 vLocalNormal;
      varying vec3 vWorldNormal;

      // Surface sampler -- definition injected at material-creation time
      // depending on the mapping option (triplanar or equirect).
      ${samplerCode}

      void main() {
        vec3 baseColor = sampleSurface();

        // Wrap shading: half-lambert when uWrap=0.5 lifts the dark side
        // so a planet is always recognisable in an overview view. Set
        // uWrap=0 for standard lambert (terminator goes to black).
        float NdotL = dot(vWorldNormal, normalize(uLightDir));
        float diffuse = max(NdotL * (1.0 - uWrap) + uWrap, 0.0);

        // Ambient floor + directional sun, then a global brightness lift.
        vec3 lit = baseColor * (uAmbient + uSunColor * diffuse) * uBrightness;

        // Optional emissive lift (e.g. lava planet self-glow on the dark
        // side). Modulated by the texture so the glow tracks the surface
        // detail rather than washing it out.
        vec3 emit = uEmissive * uEmissiveIntensity * baseColor;

        gl_FragColor = vec4(lit + emit, 1.0);
      }
    `,
  });
}

// ============================================================
// 3c. PROCEDURAL PLANET — surface generated entirely in the shader
//     from 3D noise (no input image). Continuous over the whole
//     sphere, no seams, no pole pinching, infinite detail.
// ============================================================
export function createProceduralPlanetShader(radius = 5.0, opts = {}) {
  const {
    // Surface noise
    baseScale = 1.5,
    octaves = 5,
    roughness = 0.55,
    // Color ramp -- array of {stop: 0..1, color: hex}
    colorStops = [
      { stop: 0.0, color: 0x000000 },
      { stop: 1.0, color: 0xffffff },
    ],
    // Optional latitude bands (gas giants). bandIntensity 0..1.
    bandIntensity = 0.0,
    bandFrequency = 4.0,
    bandTurbulence = 0.8,
    // Optional cloud overlay (Earth-likes). cloudOpacity 0..1.
    cloudOpacity = 0.0,
    cloudScale = 4.0,
    cloudDrift = 0.05,
    cloudColor = 0xffffff,
    // Optional domain warping -- swirly organic distortion of the noise
    // coordinates. Higher = more chaotic, gas-storm-like patterns.
    warpStrength = 0.0,
    warpScale = 1.0,
    // Optional ridged-noise overlay -- adds bright ridges/cracks on top
    // of the base FBM. Use with high emissive for lava-river effect.
    ridgeStrength = 0.0,
    ridgeScale = 3.0,
    ridgeColor = 0xffffff,
    // Optional Voronoi (cellular) overlay -- adds crystalline cells
    // or organic patches. mode='cells' fills cells, 'borders' draws lines.
    cellStrength = 0.0,
    cellScale = 4.0,
    cellMode = 'borders',
    cellColor = 0xffffff,
    // Optional Fresnel rim glow -- planet edges glow brighter, gives a
    // proper "atmosphere" feel without a separate sphere.
    fresnelStrength = 0.0,
    fresnelPower = 3.0,
    fresnelColor = 0x88aaff,
    // Optional specular highlights -- bright "shine" on water/ice where
    // light reflects toward the camera. Threshold makes only certain
    // surface noise values shiny (e.g. only water, not land).
    specularStrength = 0.0,
    specularPower = 32.0,
    specularThreshold = -1.0,  // -1 = always on; 0..1 = only when surfaceVal < threshold
    // Lighting
    lightDir = new THREE.Vector3(1, 0, 0),
    ambient = new THREE.Vector3(0.45, 0.45, 0.55),
    sunColor = new THREE.Vector3(0.80, 0.75, 0.70),
    brightness = 1.2,
    wrap = 0.5,
    // Self-glow (lava/sun)
    emissive = new THREE.Color(0x000000),
    emissiveIntensity = 0.0,
    // Skip lighting entirely (sun is its own light source)
    unlit = false,
    // Animation speed multiplier
    timeScale = 0.05,
  } = opts;

  // Pad colorStops to fixed array of 8 (uniform array size in GLSL).
  const STOPS = 8;
  const positions = new Array(STOPS).fill(1.0);
  const colors = [];
  for (let i = 0; i < STOPS; i++) {
    if (i < colorStops.length) {
      positions[i] = colorStops[i].stop;
      colors.push(new THREE.Color(colorStops[i].color));
    } else {
      const fallback = colorStops[colorStops.length - 1].color;
      colors.push(new THREE.Color(fallback));
    }
  }
  const stopCount = Math.min(colorStops.length, STOPS);

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:              { value: 0 },
      uTimeScale:         { value: timeScale },
      uRadius:            { value: radius },
      uBaseScale:         { value: baseScale },
      uRoughness:         { value: roughness },
      uOctaves:           { value: octaves },
      uColors:            { value: colors },
      uStops:             { value: positions },
      uStopCount:         { value: stopCount },
      uBandIntensity:     { value: bandIntensity },
      uBandFrequency:     { value: bandFrequency },
      uBandTurbulence:    { value: bandTurbulence },
      uCloudOpacity:      { value: cloudOpacity },
      uCloudScale:        { value: cloudScale },
      uCloudDrift:        { value: cloudDrift },
      uCloudColor:        { value: new THREE.Color(cloudColor) },
      uWarpStrength:      { value: warpStrength },
      uWarpScale:         { value: warpScale },
      uRidgeStrength:     { value: ridgeStrength },
      uRidgeScale:        { value: ridgeScale },
      uRidgeColor:        { value: new THREE.Color(ridgeColor) },
      uCellStrength:      { value: cellStrength },
      uCellScale:         { value: cellScale },
      uCellBorders:       { value: cellMode === 'borders' ? 1.0 : 0.0 },
      uCellColor:         { value: new THREE.Color(cellColor) },
      uFresnelStrength:   { value: fresnelStrength },
      uFresnelPower:      { value: fresnelPower },
      uFresnelColor:      { value: new THREE.Color(fresnelColor) },
      uSpecularStrength:  { value: specularStrength },
      uSpecularPower:     { value: specularPower },
      uSpecularThreshold: { value: specularThreshold },
      uLightDir:          { value: lightDir.clone().normalize() },
      uAmbient:           { value: ambient },
      uSunColor:          { value: sunColor },
      uBrightness:        { value: brightness },
      uWrap:              { value: wrap },
      uEmissive:          { value: emissive },
      uEmissiveIntensity: { value: emissiveIntensity },
      uUnlit:             { value: unlit ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      void main() {
        vLocalPos = position;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      ${NOISE_LIB}

      uniform float uTime;
      uniform float uTimeScale;
      uniform float uRadius;
      uniform float uBaseScale;
      uniform float uRoughness;
      uniform int uOctaves;
      uniform vec3 uColors[8];
      uniform float uStops[8];
      uniform int uStopCount;
      uniform float uBandIntensity;
      uniform float uBandFrequency;
      uniform float uBandTurbulence;
      uniform float uCloudOpacity;
      uniform float uCloudScale;
      uniform float uCloudDrift;
      uniform vec3 uCloudColor;
      uniform float uWarpStrength;
      uniform float uWarpScale;
      uniform float uRidgeStrength;
      uniform float uRidgeScale;
      uniform vec3 uRidgeColor;
      uniform float uCellStrength;
      uniform float uCellScale;
      uniform float uCellBorders;
      uniform vec3 uCellColor;
      uniform float uFresnelStrength;
      uniform float uFresnelPower;
      uniform vec3 uFresnelColor;
      uniform float uSpecularStrength;
      uniform float uSpecularPower;
      uniform float uSpecularThreshold;
      uniform vec3 uLightDir;
      uniform vec3 uAmbient;
      uniform vec3 uSunColor;
      uniform float uBrightness;
      uniform float uWrap;
      uniform vec3 uEmissive;
      uniform float uEmissiveIntensity;
      uniform float uUnlit;
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;

      // Fractal Brownian motion -- layer multiple octaves of 3D simplex
      // noise at doubling frequencies and decaying amplitude. Loop is
      // fixed-bound for GLSL ES compatibility.
      float fbm(vec3 p, float roughnessV) {
        float total = 0.0;
        float amp = 1.0;
        float freq = 1.0;
        float maxAmp = 0.0;
        for (int i = 0; i < 8; i++) {
          if (i >= uOctaves) break;
          total += snoise3(p * freq) * amp;
          maxAmp += amp;
          amp *= roughnessV;
          freq *= 2.0;
        }
        return total / maxAmp;
      }

      // Sample a soft-stepped color ramp. Sequential mix with smoothstep
      // gives smooth transitions between the (up to 8) color stops.
      vec3 sampleColorRamp(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c = uColors[0];
        for (int i = 1; i < 8; i++) {
          if (i >= uStopCount) break;
          c = mix(c, uColors[i], smoothstep(uStops[i-1], uStops[i], t));
        }
        return c;
      }

      void main() {
        float t = uTime * uTimeScale;

        // Surface noise on the unit sphere position. Using the normalised
        // local position keeps the noise scale consistent regardless of
        // the planet's actual radius.
        vec3 sp = normalize(vLocalPos);
        vec3 p = sp * uBaseScale;

        // Optional domain warping -- swirly organic distortion of the
        // sample coordinates. Animates with time so it slowly drifts.
        if (uWarpStrength > 0.001) {
          p = warpDomain(p + vec3(t * 0.1, 0.0, 0.0), uWarpStrength, uWarpScale);
        }

        float surfNoise = fbm(p, uRoughness);
        float surfaceVal = surfNoise * 0.5 + 0.5;  // [-1,1] -> [0,1]

        // Optional latitude bands (gas giants). Bands wrap around the
        // vertical axis with noise-driven turbulence so they don't
        // look like a barber pole.
        if (uBandIntensity > 0.001) {
          float lat = sp.y;  // -1 (south pole) to 1 (north pole)
          float wobble = fbm(p * 0.4, 0.55) * uBandTurbulence;
          float band = sin(lat * uBandFrequency * 3.14159 + wobble * 2.0);
          band = band * 0.5 + 0.5;
          surfaceVal = mix(surfaceVal, band, uBandIntensity);
        }

        vec3 baseColor = sampleColorRamp(surfaceVal);

        // Optional ridged-noise overlay -- bright cracks/ridges on top
        // of the base. Use with high emissive for lava-river effect.
        if (uRidgeStrength > 0.001) {
          float ridge = ridged3(sp * uRidgeScale + vec3(t * 0.05, 0.0, 0.0));
          ridge = pow(max(ridge - 0.6, 0.0) / 0.4, 2.0);
          baseColor = mix(baseColor, uRidgeColor, ridge * uRidgeStrength);
        }

        // Optional Voronoi cellular overlay -- crystalline cells (mode=cells)
        // or cell-border outlines (mode=borders).
        if (uCellStrength > 0.001) {
          vec2 v = voronoi3(sp * uCellScale);
          float cellPattern;
          if (uCellBorders > 0.5) {
            // F2 - F1 = distance between nearest and second-nearest cells.
            // Small at borders -> invert and threshold for sharp lines.
            cellPattern = 1.0 - smoothstep(0.0, 0.08, v.y - v.x);
          } else {
            // F1 distance gives bumps centred on each cell.
            cellPattern = 1.0 - smoothstep(0.1, 0.5, v.x);
          }
          baseColor = mix(baseColor, uCellColor, cellPattern * uCellStrength);
        }

        // Optional cloud overlay -- second noise layer drifting over
        // time. Only the high values become visible cloud.
        if (uCloudOpacity > 0.001) {
          vec3 cloudP = sp * uCloudScale + vec3(t * uCloudDrift, 0.0, 0.0);
          float cloudNoise = fbm(cloudP, 0.55);
          float cloudMask = smoothstep(0.05, 0.45, cloudNoise) * uCloudOpacity;
          baseColor = mix(baseColor, uCloudColor, cloudMask);
        }

        // Lighting. Unlit mode (sun) outputs baseColor*brightness directly.
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(uLightDir);
        vec3 lit;
        if (uUnlit > 0.5) {
          lit = baseColor * uBrightness;
        } else {
          float NdotL = dot(N, L);
          float diffuse = max(NdotL * (1.0 - uWrap) + uWrap, 0.0);
          lit = baseColor * (uAmbient + uSunColor * diffuse) * uBrightness;

          // Optional specular highlight -- bright reflection toward camera.
          // Threshold gates by surfaceVal so e.g. only "ocean" pixels shine.
          if (uSpecularStrength > 0.001) {
            float gate = (uSpecularThreshold < 0.0) ? 1.0
                       : step(surfaceVal, uSpecularThreshold);
            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), uSpecularPower);
            lit += uSunColor * spec * uSpecularStrength * gate * max(NdotL, 0.0);
          }
        }

        // Optional Fresnel rim glow -- planet edges glow brighter for
        // an "atmosphere" effect baked into the surface shader.
        if (uFresnelStrength > 0.001) {
          float fr = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);
          lit += uFresnelColor * fr * uFresnelStrength;
        }

        // Emissive lift -- modulated by the surface so glow tracks
        // bright areas (e.g. magma rivers self-glow on dark side).
        vec3 emit = uEmissive * uEmissiveIntensity * baseColor;

        gl_FragColor = vec4(lit + emit, 1.0);
      }
    `,
  });
}

// ============================================================
// 4. SHIELD / FORCE FIELD — Hexagonal grid + impact waves
// ============================================================
export function createShieldShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x00ccff) },
      uImpactPoint: { value: new THREE.Vector3(0, 0, 0) },
      uImpactTime: { value: -10.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vUv = uv;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uImpactPoint;
      uniform float uImpactTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      // Hexagonal distance function
      float hexDist(vec2 p) {
        p = abs(p);
        float c = dot(p, normalize(vec2(1.0, 1.73)));
        c = max(c, p.x);
        return c;
      }

      vec4 hexCoords(vec2 uv) {
        vec2 r = vec2(1.0, 1.73);
        vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h;
        vec2 b = mod(uv - h, r) - h;
        vec2 gv = dot(a,a) < dot(b,b) ? a : b;
        float x = atan(gv.x, gv.y);
        float y = 0.5 - hexDist(gv);
        vec2 id = uv - gv;
        return vec4(x, y, id.x, id.y);
      }

      void main() {
        // Fresnel rim
        float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        fresnel = pow(fresnel, 1.8);

        // Hex grid
        vec2 hexUV = vWorldPos.xz * 3.0;
        vec4 hc = hexCoords(hexUV);
        float hexEdge = smoothstep(0.0, 0.05, hc.y);
        float hexGrid = 1.0 - hexEdge;

        // Animated scan lines
        float scan = sin(vWorldPos.y * 15.0 - uTime * 4.0);
        scan = smoothstep(0.92, 1.0, scan) * 0.4;

        // Impact ripple
        float impactDist = distance(vWorldPos, uImpactPoint);
        float timeSinceImpact = uTime - uImpactTime;
        float ripple = sin(impactDist * 20.0 - timeSinceImpact * 10.0);
        ripple *= exp(-timeSinceImpact * 2.0) * exp(-impactDist * 0.5);
        ripple = max(ripple, 0.0) * step(0.0, timeSinceImpact);

        // Combine
        float alpha = fresnel * 0.5 + hexGrid * 0.15 + scan + ripple * 0.8;
        alpha = clamp(alpha, 0.0, 0.85);

        vec3 color = uColor;
        color += uColor * ripple * 2.0;
        color += vec3(0.5, 0.8, 1.0) * hexGrid * 0.2;

        // Flicker
        float flicker = sin(uTime * 8.0) * 0.03 + 1.0;
        alpha *= flicker;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ============================================================
// 5. ENERGY FLOW SHADER — Animated energy beam/pipe
// ============================================================
export function createEnergyFlowShader(color = new THREE.Color(0x00ccff)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uSpeed: { value: 2.5 },
      uPulseWidth: { value: 0.15 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      uniform float uPulseWidth;
      varying vec2 vUv;

      void main() {
        // Edge falloff (soft pipe shape)
        float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
        edge = pow(edge, 1.5);

        // Multiple flowing energy pulses at different speeds
        float flow1 = fract(vUv.x * 3.0 - uTime * uSpeed);
        flow1 = smoothstep(0.0, uPulseWidth, flow1) * smoothstep(uPulseWidth * 2.0, uPulseWidth, flow1);

        float flow2 = fract(vUv.x * 5.0 - uTime * uSpeed * 1.3 + 0.5);
        flow2 = smoothstep(0.0, uPulseWidth * 0.7, flow2) * smoothstep(uPulseWidth * 1.4, uPulseWidth * 0.7, flow2);
        flow2 *= 0.5;

        // Core glow (always-on base)
        float core = edge * 0.3;

        float intensity = (flow1 + flow2) * edge + core;

        // Color with slight hue shift for energy feel
        vec3 col = uColor * intensity * 1.2;
        col += vec3(0.1, 0.2, 0.3) * pow(intensity, 3.0) * 0.3;

        float alpha = intensity * 0.9;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ============================================================
// 6. STYLIZED NEBULA SKYBOX — Animated, saturated, SC2-style
// ============================================================
export function createNebulaShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldDir;

      ${NOISE_LIB}

      void main() {
        vec3 dir = normalize(vWorldDir);
        float t = uTime * 0.025; // 3x faster animation — feels alive

        vec2 p = dir.xz / (abs(dir.y) + 0.4);

        // === SWIRLING CLOUD VOLUME ===
        // Single warp pass with visible drift
        vec2 drift = vec2(snoise(p * 0.8 + t * 0.6), snoise(p * 0.8 + vec2(5.0) - t * 0.4));
        float clouds = snoise(p * 1.5 + drift * 0.5) * 0.5 + 0.5;

        // Hard-ish banding for stylized look (not pure step, slight gradient)
        float cloudBand = smoothstep(0.3, 0.35, clouds) * (1.0 - smoothstep(0.6, 0.65, clouds));
        float darkCloud = smoothstep(0.5, 0.55, clouds);

        // Deep space base — not pure black, has purple-blue tint
        vec3 spaceColor = vec3(0.02, 0.015, 0.05);

        // Cloud colors — saturated, not gray
        vec3 cloudDark = vec3(0.06, 0.04, 0.12);
        vec3 cloudMid = vec3(0.12, 0.06, 0.20);
        vec3 cloudBright = vec3(0.08, 0.10, 0.15);

        vec3 cloudColor = mix(spaceColor, cloudDark, cloudBand);
        cloudColor = mix(cloudColor, cloudBright, darkCloud);

        // === ENERGY RIFT — bright river of cyan-purple ===
        float riftBase = snoise(p * 0.5 + vec2(t * 0.4, -t * 0.3));
        float rift = smoothstep(-0.05, 0.1, riftBase) * (1.0 - smoothstep(0.1, 0.3, riftBase));

        // Animate rift brightness with pulsing
        float riftPulse = sin(uTime * 0.4 + p.x * 2.0) * 0.2 + 0.8;
        rift *= riftPulse;

        // Rift color — saturated purple to cyan gradient
        vec3 riftColor = mix(vec3(0.25, 0.05, 0.5), vec3(0.1, 0.6, 1.0), smoothstep(0.0, 0.2, riftBase));

        // === BRIGHT STARS — scattered points ===
        float stars = snoise(p * 40.0);
        stars = pow(max(stars, 0.0), 12.0);
        // Color-varied stars
        vec3 starColor = mix(vec3(1.0, 0.9, 0.7), vec3(0.7, 0.85, 1.0), snoise(p * 10.0) * 0.5 + 0.5);

        // === WARM EDGE HIGHLIGHTS where clouds meet rift ===
        float edgeZone = smoothstep(0.0, 0.15, riftBase) * smoothstep(0.35, 0.15, riftBase);
        edgeZone *= smoothstep(0.25, 0.5, clouds); // only where clouds are present
        vec3 warmEdge = vec3(1.0, 0.5, 0.1) * edgeZone * 0.6;

        // === COMPOSITE ===
        vec3 color = cloudColor;
        color = mix(color, riftColor * 1.5, rift * 0.7);
        color += warmEdge;
        color += starColor * stars * 0.6;

        // Contrast boost
        color *= 1.3;
        color = min(color, vec3(1.5));

        gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
  });
}

// ============================================================
// 7. TWINKLING STARFIELD SHADER
// ============================================================
export function createStarfieldShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute float aBrightness;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vBrightness;
      varying vec3 vColor;

      void main() {
        vColor = color;

        // Twinkle: multiple sine waves for organic feel
        float twinkle = sin(uTime * 1.5 + aPhase * 6.283) * 0.25;
        twinkle += sin(uTime * 3.7 + aPhase * 12.566) * 0.1;
        twinkle += 0.65;
        vBrightness = twinkle * aBrightness;

        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (200.0 / -mvPos.z);
        gl_PointSize = clamp(gl_PointSize, 0.5, 5.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying vec3 vColor;

      void main() {
        // Airy disc approximation for star point spread
        float dist = length(gl_PointCoord - 0.5) * 2.0;
        float core = exp(-dist * dist * 8.0); // sharp bright core
        float halo = exp(-dist * 2.0) * 0.3;  // soft halo
        float alpha = (core + halo) * vBrightness;

        vec3 col = vColor * vBrightness * 1.5;
        // Brightest stars get a white-blue core
        col = mix(col, vec3(1.5), core * 0.6);

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
}

// ============================================================
// 8. HOLOGRAM PREVIEW SHADER — Ghost building for placement
// ============================================================
export function createHologramShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x00ccff) },
      uValid: { value: 1.0 }, // 1.0 = valid placement, 0.0 = invalid (red)
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uValid;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;

      void main() {
        vec3 validColor = uColor;
        vec3 invalidColor = vec3(1.0, 0.2, 0.1);
        vec3 col = mix(invalidColor, validColor, uValid);

        // Fresnel edge
        float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        fresnel = pow(fresnel, 1.5) * 0.8;

        // Horizontal scan lines
        float scanLine = sin(vWorldPos.y * 30.0 - uTime * 5.0);
        scanLine = step(0.85, scanLine) * 0.25;

        // Vertical data rain
        float dataRain = sin(vWorldPos.x * 20.0 + uTime * 8.0);
        dataRain *= sin(vWorldPos.z * 20.0 - uTime * 6.0);
        dataRain = step(0.9, dataRain) * 0.15;

        // Base fill + flicker
        float flicker = sin(uTime * 20.0) * 0.04 + 0.96;
        float alpha = (fresnel + 0.12 + scanLine + dataRain) * flicker;
        alpha = clamp(alpha, 0.0, 0.65);

        gl_FragColor = vec4(col * 1.8, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ============================================================
// 9. STYLIZED BUILDING SHADER — Toon PBR with panel lines
// ============================================================
export function createBuildingShader(baseColor = new THREE.Color(0x3a3a4a), emissiveColor = new THREE.Color(0x000000)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: baseColor },
      uEmissiveColor: { value: emissiveColor },
      uEmissiveIntensity: { value: 0.0 },
      uMetalness: { value: 0.85 },
      uRoughness: { value: 0.3 },
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uLightColor: { value: new THREE.Color(0xffaa66) },
      uAmbientColor: { value: new THREE.Color(0x221111) },
      uRimColor: { value: new THREE.Color(0x4466aa) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseColor;
      uniform vec3 uEmissiveColor;
      uniform float uEmissiveIntensity;
      uniform float uMetalness;
      uniform float uRoughness;
      uniform float uTime;
      uniform vec3 uLightDir;
      uniform vec3 uLightColor;
      uniform vec3 uAmbientColor;
      uniform vec3 uRimColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      ${NOISE_LIB}

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(uLightDir);
        vec3 H = normalize(L + V);

        // === STYLIZED DIFFUSE (smooth toon bands) ===
        float NdotL = dot(N, L);
        // 3-band toon shading with smooth transitions
        float diffuse = smoothstep(-0.1, 0.1, NdotL) * 0.4 + 0.1;
        diffuse += smoothstep(0.3, 0.5, NdotL) * 0.3;
        diffuse += smoothstep(0.7, 0.9, NdotL) * 0.2;

        // === SPECULAR (stylized Blinn-Phong) ===
        float NdotH = max(dot(N, H), 0.0);
        float spec = pow(NdotH, mix(8.0, 64.0, 1.0 - uRoughness));
        // Sharp specular highlight (toon style)
        spec = smoothstep(0.4, 0.6, spec) * uMetalness;

        // === PANEL LINES ===
        // Procedural detail using world position
        vec3 wp = vWorldPos * 2.0;
        float panelX = abs(fract(wp.x) - 0.5);
        float panelY = abs(fract(wp.y) - 0.5);
        float panelZ = abs(fract(wp.z) - 0.5);
        float panel = min(min(panelX, panelY), panelZ);
        float panelLine = 1.0 - smoothstep(0.0, 0.04, panel);
        panelLine *= 0.15; // subtle darkness in panel seams

        // === WEATHERING ===
        float wear = snoise(vWorldPos * 4.0) * 0.5 + 0.5;
        wear = wear * 0.1; // subtle

        // === RIM LIGHT ===
        float rim = 1.0 - max(dot(N, V), 0.0);
        rim = pow(rim, 3.0) * 0.6;

        // === LAVA UNDERLIGHT ===
        float lavaBounce = max(-N.y, 0.0) * 0.3;
        vec3 lavaColor = vec3(1.0, 0.3, 0.05) * lavaBounce;

        // === COMBINE ===
        vec3 color = uBaseColor * (1.0 - panelLine - wear);
        color *= uAmbientColor * 1.5 + uLightColor * diffuse;
        color += uLightColor * spec * 0.8;
        color += uRimColor * rim;
        color += lavaColor;
        color += uEmissiveColor * uEmissiveIntensity;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// ============================================================
// TEXTURED BUILDING SHADER — for GLBs from Hunyuan3D pipeline
// ============================================================
// Reads the albedo texture from the GLB, then layers the same
// toon lighting, panel lines, weathering, rim light, and lava
// underlight that createBuildingShader() uses for primitives.
// This gives imported assets the same stylized RTS look as the
// handmade placeholder buildings.
export function createTexturedBuildingShader(albedoMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlbedo: { value: albedoMap },
      uMetalness: { value: 0.7 },
      uRoughness: { value: 0.35 },
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uLightColor: { value: new THREE.Color(0xffaa66) },
      uAmbientColor: { value: new THREE.Color(0x221111) },
      uRimColor: { value: new THREE.Color(0x4466aa) },
      uTeamColor: { value: new THREE.Color(0x00eeff) },
      uTeamIntensity: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uAlbedo;
      uniform float uMetalness;
      uniform float uRoughness;
      uniform float uTime;
      uniform vec3 uLightDir;
      uniform vec3 uLightColor;
      uniform vec3 uAmbientColor;
      uniform vec3 uRimColor;
      uniform vec3 uTeamColor;
      uniform float uTeamIntensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      ${NOISE_LIB}

      void main() {
        vec3 baseColor = texture2D(uAlbedo, vUv).rgb;

        // === TEAM-COLOR MASK ===
        // Asset prompts (see asset-pipeline/prompts.py) reserve bright
        // magenta (1, 0, 1) for player-tinted regions. Detect those
        // pixels here and substitute uTeamColor so the same baked
        // texture works for every player.
        // Mask = high R * high B * low G; thresholded so dark or muted
        // colors don't trigger.
        float magentaMask = baseColor.r * baseColor.b * (1.0 - baseColor.g);
        magentaMask = smoothstep(0.3, 0.6, magentaMask);
        baseColor = mix(baseColor, uTeamColor, magentaMask);

        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(uLightDir);
        vec3 H = normalize(L + V);

        // === STYLIZED DIFFUSE (3-band toon) ===
        float NdotL = dot(N, L);
        float diffuse = smoothstep(-0.1, 0.1, NdotL) * 0.4 + 0.1;
        diffuse += smoothstep(0.3, 0.5, NdotL) * 0.3;
        diffuse += smoothstep(0.7, 0.9, NdotL) * 0.2;

        // === SPECULAR ===
        float NdotH = max(dot(N, H), 0.0);
        float spec = pow(NdotH, mix(8.0, 64.0, 1.0 - uRoughness));
        spec = smoothstep(0.4, 0.6, spec) * uMetalness;

        // === PANEL LINES (from world pos) ===
        vec3 wp = vWorldPos * 2.0;
        float panelX = abs(fract(wp.x) - 0.5);
        float panelY = abs(fract(wp.y) - 0.5);
        float panelZ = abs(fract(wp.z) - 0.5);
        float panel = min(min(panelX, panelY), panelZ);
        float panelLine = 1.0 - smoothstep(0.0, 0.04, panel);
        panelLine *= 0.12;

        // === WEATHERING ===
        float wear = snoise(vWorldPos * 4.0) * 0.5 + 0.5;
        wear *= 0.08;

        // === RIM LIGHT ===
        float rim = 1.0 - max(dot(N, V), 0.0);
        rim = pow(rim, 3.0) * 0.5;

        // === LAVA UNDERLIGHT ===
        float lavaBounce = max(-N.y, 0.0) * 0.25;
        vec3 lavaColor = vec3(1.0, 0.3, 0.05) * lavaBounce;

        // === COMBINE ===
        vec3 color = baseColor * (1.0 - panelLine - wear);
        color *= uAmbientColor * 1.5 + uLightColor * diffuse;
        color += uLightColor * spec * 0.6;
        color += uRimColor * rim;
        color += lavaColor;
        // Team color accent (driven by game code)
        color += uTeamColor * uTeamIntensity * rim * 2.0;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// ============================================================
// POST-PROCESSING SHADERS
// ============================================================

// 10. HEAT DISTORTION with chromatic aberration
export const HeatDistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 0.001 },
    uEnabled: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uEnabled;
    varying vec2 vUv;

    ${NOISE_LIB}

    void main() {
      if (uEnabled < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      // Heat shimmer — stronger near bottom of screen (where lava is)
      float heatMask = pow(1.0 - vUv.y, 2.0);

      // Noise-driven distortion for organic shimmer
      float nx = snoise(vec2(vUv.x * 15.0, vUv.y * 10.0 + uTime * 2.0));
      float ny = snoise(vec2(vUv.x * 12.0 + 5.0, vUv.y * 8.0 + uTime * 1.7));

      vec2 distortion = vec2(nx, ny) * uIntensity * heatMask;

      // Chromatic aberration following the distortion
      float aberr = length(distortion) * 6.0;
      vec4 color;
      color.r = texture2D(tDiffuse, vUv + distortion + vec2(aberr, 0.0)).r;
      color.g = texture2D(tDiffuse, vUv + distortion).g;
      color.b = texture2D(tDiffuse, vUv + distortion - vec2(aberr, 0.0)).b;
      color.a = 1.0;

      gl_FragColor = color;
    }
  `,
};

// 11. VIGNETTE + COLOR GRADING + FILM GRAIN
export const VignetteGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVigDarkness: { value: 0.4 },
    uVigOffset: { value: 1.1 },
    uTintColor: { value: new THREE.Color(0xff6600) },
    uTintStrength: { value: 0.06 },
    uGrainAmount: { value: 0.02 },
    uContrast: { value: 1.0 },
    uSaturation: { value: 1.05 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVigDarkness;
    uniform float uVigOffset;
    uniform vec3 uTintColor;
    uniform float uTintStrength;
    uniform float uGrainAmount;
    uniform float uContrast;
    uniform float uSaturation;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // --- Contrast ---
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

      // --- Saturation ---
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(lum), color.rgb, uSaturation);

      // --- Warm shadow tint ---
      float shadowMask = 1.0 - smoothstep(0.0, 0.4, lum);
      color.rgb += uTintColor * shadowMask * uTintStrength;

      // --- Vignette ---
      vec2 uv = (vUv - 0.5) * 2.0;
      float vig = 1.0 - dot(uv, uv) * uVigDarkness;
      vig = smoothstep(0.0, uVigOffset, vig);
      color.rgb *= vig;

      // --- Film grain ---
      float grain = (rand(vUv + fract(uTime)) - 0.5) * uGrainAmount;
      color.rgb += grain;

      color.rgb = clamp(color.rgb, 0.0, 1.0);
      gl_FragColor = color;
    }
  `,
};

// ============================================================
// 12. PLANET SURFACE SHADERS (for future biomes)
// ============================================================

// Ice world surface
export function createIceShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      ${NOISE_LIB}

      void main() {
        vec2 uv = vWorldPos.xz * 0.05;
        float t = uTime * 0.03;

        // Crystal fracture pattern
        vec2 vor = voronoi(uv * 4.0);
        float cracks = 1.0 - smoothstep(0.0, 0.03, vor.x);

        // Ice layers
        float n = fbm(uv * 2.0 + t, 5) * 0.5 + 0.5;

        vec3 iceBlue = vec3(0.6, 0.8, 1.0);
        vec3 deepBlue = vec3(0.1, 0.2, 0.4);
        vec3 white = vec3(0.9, 0.95, 1.0);

        vec3 color = mix(deepBlue, iceBlue, n);
        color = mix(color, white, cracks * 0.8);

        // Subsurface glow
        float sss = pow(n, 3.0) * 0.3;
        color += vec3(0.2, 0.5, 0.8) * sss;

        // Sparkle
        float sparkle = pow(max(snoise(uv * 30.0 + t * 2.0), 0.0), 8.0);
        color += vec3(1.0) * sparkle * 0.5;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}
