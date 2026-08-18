export const VISUALIZER_MODES = [
  'bars',
  'mirror',
  'wave',
  'circular',
  'ambient',
  'starfield',
  'sparks',
  'dust',
  'fountain',
  'orbit',
  'rain',
  'ribbons',
  'neonTunnel',
  'landscape',
  'geometry',
  'towers',
  'galaxy',
  'plasma',
  'album3d',
  'kaleidoscope',
  'ai',
] as const;

export type VisualizerMode = (typeof VISUALIZER_MODES)[number];
export type VisualizerCategory = 'Classic' | 'Particles' | '3D & shaders' | 'Adaptive';
export type VisualizerRenderer = 'canvas2d' | 'webgl';

export interface VisualizerPreset {
  id: VisualizerMode;
  name: string;
  description: string;
  category: VisualizerCategory;
  renderer: VisualizerRenderer;
}

export const VISUALIZER_PRESETS: VisualizerPreset[] = [
  {
    id: 'bars',
    name: 'Prism bars',
    description: 'Clean frequency columns with a neon gradient.',
    category: 'Classic',
    renderer: 'canvas2d',
  },
  {
    id: 'mirror',
    name: 'Mirror pulse',
    description: 'A symmetrical spectrum breathing from the centre.',
    category: 'Classic',
    renderer: 'canvas2d',
  },
  {
    id: 'wave',
    name: 'Electric scope',
    description: 'Layered oscilloscope trails driven by the waveform.',
    category: 'Classic',
    renderer: 'canvas2d',
  },
  {
    id: 'circular',
    name: 'Solar spectrum',
    description: 'A radial spectrum with bass-powered corona rings.',
    category: 'Classic',
    renderer: 'canvas2d',
  },
  {
    id: 'ambient',
    name: 'Aurora glow',
    description: 'Soft colour fields that follow the energy bands.',
    category: 'Classic',
    renderer: 'canvas2d',
  },
  {
    id: 'starfield',
    name: 'Hyperdrive',
    description: 'A deep star field accelerating into every beat.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'sparks',
    name: 'Beat sparks',
    description: 'Drum transients ignite showers of electric sparks.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'dust',
    name: 'Cosmic dust',
    description: 'Floating luminous dust shaped by spectral motion.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'fountain',
    name: 'Chromatic fountain',
    description: 'Music launches colour from the floor in arcs.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'orbit',
    name: 'Album orbit',
    description: 'Particles orbit the artwork and break formation on beats.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'rain',
    name: 'Neon rain',
    description: 'Reactive rain bends with bass and flashes on transients.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'ribbons',
    name: 'Ribbon trails',
    description: 'Silky multi-band trails flow through the sound field.',
    category: 'Particles',
    renderer: 'canvas2d',
  },
  {
    id: 'neonTunnel',
    name: 'Neon tunnel',
    description: 'A GPU tunnel races forward with tempo and bass.',
    category: '3D & shaders',
    renderer: 'webgl',
  },
  {
    id: 'landscape',
    name: 'Audio landscape',
    description: 'Waveform ridges roll toward the listener in perspective.',
    category: '3D & shaders',
    renderer: 'canvas2d',
  },
  {
    id: 'geometry',
    name: 'Pulse geometry',
    description: 'Layered geometric forms rotate and bloom.',
    category: '3D & shaders',
    renderer: 'canvas2d',
  },
  {
    id: 'towers',
    name: 'Frequency city',
    description: 'A GPU city of frequency towers stretches to the horizon.',
    category: '3D & shaders',
    renderer: 'webgl',
  },
  {
    id: 'galaxy',
    name: 'Particle galaxy',
    description: 'A spiralling GPU galaxy responds across the spectrum.',
    category: '3D & shaders',
    renderer: 'webgl',
  },
  {
    id: 'plasma',
    name: 'Liquid plasma',
    description: 'A fluid shader folds colour through the music.',
    category: '3D & shaders',
    renderer: 'webgl',
  },
  {
    id: 'album3d',
    name: 'Album dimension',
    description: 'The cover floats, rotates and throws reactive light.',
    category: '3D & shaders',
    renderer: 'canvas2d',
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope',
    description: 'MilkDrop-inspired radial waveform reflections.',
    category: 'Adaptive',
    renderer: 'canvas2d',
  },
  {
    id: 'ai',
    name: 'AI Conductor',
    description: 'A local audio director interprets mood, motion and impact.',
    category: 'Adaptive',
    renderer: 'webgl',
  },
];

export const VISUALIZER_CATEGORIES: Array<'All' | VisualizerCategory> = [
  'All',
  'Classic',
  'Particles',
  '3D & shaders',
  'Adaptive',
];

export function presetFor(mode: VisualizerMode): VisualizerPreset {
  return VISUALIZER_PRESETS.find((preset) => preset.id === mode) ?? VISUALIZER_PRESETS[0]!;
}

export function nextVisualizerMode(
  current: VisualizerMode,
  candidates: VisualizerMode[],
  random: boolean,
  randomValue: () => number = Math.random,
): VisualizerMode {
  const available = candidates.length ? candidates : [...VISUALIZER_MODES];
  if (available.length === 1) return available[0]!;
  if (random) {
    const alternatives = available.filter((mode) => mode !== current);
    return alternatives[Math.floor(randomValue() * alternatives.length)] ?? alternatives[0]!;
  }
  const index = available.indexOf(current);
  return available[(index + 1 + available.length) % available.length]!;
}
