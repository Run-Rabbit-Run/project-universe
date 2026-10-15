// Режим «1845»: кадр превращается в карандашный рисунок на бумаге,
// как зарисовка лорда Росса — первое изображение спиральной «туманности».

export const SketchShader = {
  name: 'SketchShader',
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 },
    uRes: { value: [1, 1] },
    uDpr: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform vec2 uRes;
    uniform float uDpr;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        s += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return s;
    }

    void main() {
      vec3 src = texture2D(tDiffuse, vUv).rgb;
      if (uAmount <= 0.001) {
        gl_FragColor = vec4(src, 1.0);
        return;
      }
      // Глаз у окуляра не видит мелких деталей — смягчаем картинку.
      vec2 px = 1.0 / uRes;
      vec3 blur = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        blur += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * px * 3.5 * uDpr).rgb;
      }
      blur /= 8.0;
      float L = dot(mix(src, blur, 0.65), vec3(0.2126, 0.7152, 0.0722));
      float tone = smoothstep(0.04, 0.95, pow(L, 0.85));

      vec2 fc = gl_FragCoord.xy / uDpr;
      // Штрихи графита в двух направлениях: чем ярче туманность, тем гуще штриховка.
      vec2 d1 = vec2(0.866, 0.5);
      vec2 d2 = vec2(0.5, -0.866);
      float n1 = vnoise(vec2(dot(fc, d1) * 0.035, dot(fc, vec2(-d1.y, d1.x)) * 1.1));
      float n2 = vnoise(vec2(dot(fc, d2) * 0.035, dot(fc, vec2(-d2.y, d2.x)) * 1.1));
      float th1 = 1.0 - tone * 1.1;
      float th2 = 1.45 - tone * 1.1;
      float s1 = smoothstep(th1, th1 + 0.22, n1);
      float s2 = smoothstep(th2, th2 + 0.22, n2);
      float grain = vnoise(fc * 0.8);
      float ink = clamp(max(s1, s2 * 0.8) * 0.6 + tone * 0.38, 0.0, 1.0) * (0.7 + 0.3 * grain);

      float paperN = fbm(fc * 0.004) * 0.6 + vnoise(fc * 0.4) * 0.4;
      vec3 paper = vec3(0.925, 0.886, 0.8) * (0.93 + 0.1 * paperN);
      vec3 graphite = vec3(0.16, 0.15, 0.14);
      vec3 col = mix(paper, graphite, ink * 0.82);
      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * 0.4;

      gl_FragColor = vec4(mix(src, col, uAmount), 1.0);
    }
  `,
};
