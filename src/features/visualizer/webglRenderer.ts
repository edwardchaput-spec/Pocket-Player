import { AudioFeatures } from './audioFeatures';
import { VisualizerMode } from './visualizerPresets';

const WEBGL_MODES: Partial<Record<VisualizerMode, number>> = {
  neonTunnel: 0,
  towers: 1,
  galaxy: 2,
  plasma: 3,
  ai: 4,
};

export function isWebGLMode(mode: VisualizerMode): boolean {
  return WEBGL_MODES[mode] != null;
}

export interface WebGLScene {
  renderer: string;
  render(features: AudioFeatures, elapsedSeconds: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export function createWebGLScene(
  canvas: HTMLCanvasElement,
  mode: VisualizerMode,
  seed: number,
): WebGLScene | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  const buffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  if (!buffer || !vao) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    time: gl.getUniformLocation(program, 'uTime'),
    bass: gl.getUniformLocation(program, 'uBass'),
    mid: gl.getUniformLocation(program, 'uMid'),
    treble: gl.getUniformLocation(program, 'uTreble'),
    energy: gl.getUniformLocation(program, 'uEnergy'),
    beat: gl.getUniformLocation(program, 'uBeat'),
    centroid: gl.getUniformLocation(program, 'uCentroid'),
    mode: gl.getUniformLocation(program, 'uMode'),
    seed: gl.getUniformLocation(program, 'uSeed'),
  };
  gl.useProgram(program);
  gl.uniform1i(uniforms.mode, WEBGL_MODES[mode] ?? 0);
  gl.uniform1f(uniforms.seed, seed);
  const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = rendererInfo
    ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  return {
    renderer,
    resize(width, height) {
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
    },
    render(features, elapsedSeconds) {
      gl.useProgram(program);
      gl.uniform1f(uniforms.time, elapsedSeconds);
      gl.uniform1f(uniforms.bass, features.bass);
      gl.uniform1f(uniforms.mid, features.mid);
      gl.uniform1f(uniforms.treble, features.treble);
      gl.uniform1f(uniforms.energy, features.energy);
      gl.uniform1f(uniforms.beat, features.beat);
      gl.uniform1f(uniforms.centroid, features.centroid);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform float uCentroid;
uniform float uSeed;
uniform int uMode;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + uSeed);
  return fract(p.x * p.y);
}

vec3 palette(float t) {
  vec3 a = vec3(0.48, 0.42, 0.58);
  vec3 b = vec3(0.48, 0.46, 0.42);
  vec3 c = vec3(1.0, 0.85 + uTreble * 0.2, 0.72);
  vec3 d = vec3(0.12 + uBass * 0.1, 0.25 + uMid * 0.12, 0.58 + uCentroid * 0.12);
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 tunnel(vec2 uv, float time) {
  float angle = atan(uv.y, uv.x);
  float radius = max(0.025, length(uv));
  float depth = 0.85 / radius + time * (1.35 + uBass * 2.8);
  float rings = pow(1.0 - abs(fract(depth) - 0.5) * 2.0, 12.0);
  float spokes = pow(1.0 - abs(sin(angle * (8.0 + floor(uMid * 6.0)) + sin(depth * 0.3))), 16.0);
  float pulse = rings + spokes * 0.65 + uBeat * 0.5 / (1.0 + radius * 5.0);
  return palette(depth * 0.075 + angle / 6.28) * pulse * (0.35 + radius);
}

vec3 towers(vec2 uv, float time) {
  vec2 p = uv;
  p.y += 0.23;
  float horizon = max(0.04, p.y + 0.62);
  float depth = 1.0 / horizon;
  vec2 grid = vec2(p.x * depth * 6.0, depth * 1.8 + time * (0.75 + uEnergy));
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float frequency = 0.22 + 0.78 * hash21(vec2(cell.x, floor(cell.y * 0.17)));
  float height = frequency * (0.45 + uMid * 0.9) + uBeat * 0.22;
  float building = (1.0 - smoothstep(0.31, 0.44, abs(local.x))) * (1.0 - smoothstep(height - 0.09, height, local.y + 0.5));
  float gridLine = smoothstep(0.055, 0.0, min(abs(local.x), abs(local.y))) * 0.32;
  vec3 colour = palette(frequency + cell.x * 0.05 + time * 0.04);
  return colour * (building + gridLine) / (1.0 + depth * 0.03);
}

vec3 galaxy(vec2 uv, float time) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float spiral = a + r * (8.0 + uMid * 4.0) - time * (0.3 + uBass * 0.35);
  float arms = pow(max(0.0, cos(spiral * 2.0)), 10.0) * exp(-r * 1.6);
  vec2 cells = floor((uv + vec2(sin(time * 0.03), cos(time * 0.025))) * 110.0);
  float stars = step(0.985 - uTreble * 0.008, hash21(cells));
  stars *= pow(hash21(cells + 7.3), 5.0) * (1.0 + uBeat * 2.0);
  float core = 0.025 / max(0.008, r * r);
  return palette(r + time * 0.025) * (arms * (0.35 + uEnergy) + stars + core * (0.35 + uBass));
}

vec3 plasma(vec2 uv, float time) {
  vec2 p = uv;
  float value = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i) + 1.0;
    p += vec2(sin(p.y * (1.8 + fi) + time * (0.18 * fi + uBass)), cos(p.x * (2.1 + fi) - time * (0.14 * fi + uTreble))) * (0.12 + uEnergy * 0.035);
    value += sin((p.x + p.y) * fi * 1.6 + time * 0.3 + uBeat * fi);
  }
  float liquid = value / 5.0;
  return palette(liquid * 0.32 + time * 0.035 + uCentroid) * (0.65 + 0.5 * cos(liquid * PI));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  vec3 colour;
  if (uMode == 0) colour = tunnel(uv, uTime);
  else if (uMode == 1) colour = towers(uv, uTime);
  else if (uMode == 2) colour = galaxy(uv, uTime);
  else if (uMode == 3) colour = plasma(uv, uTime);
  else {
    // AI Conductor: spectral balance selects the scene while flux and beat crossfade it.
    vec3 spacious = galaxy(uv, uTime * (0.72 + uCentroid));
    vec3 kinetic = tunnel(uv, uTime * (0.85 + uBass));
    vec3 fluid = plasma(uv, uTime * (0.75 + uMid));
    float drive = smoothstep(0.28, 0.72, uBass + uBeat * 0.35);
    float air = smoothstep(0.25, 0.78, uTreble + uCentroid * 0.35);
    colour = mix(fluid, kinetic, drive);
    colour = mix(colour, spacious, air * (1.0 - drive * 0.35));
    colour += palette(uTime * 0.08) * uBeat * 0.35;
  }
  colour = 1.0 - exp(-colour * (1.15 + uEnergy * 0.8));
  float vignette = 1.0 - smoothstep(0.55, 1.55, length(uv));
  outColor = vec4(colour * (0.38 + vignette * 0.85), 1.0);
}`;
