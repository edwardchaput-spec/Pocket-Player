import { createContext, PropsWithChildren, useContext } from 'react';

import type { AudioAnalyserSource } from './nativeAnalyser';

const AudioAnalysisContext = createContext<AudioAnalyserSource | null>(null);

export function AudioAnalysisProvider({
  analyser,
  children,
}: PropsWithChildren<{ analyser: AudioAnalyserSource | null }>) {
  return <AudioAnalysisContext.Provider value={analyser}>{children}</AudioAnalysisContext.Provider>;
}

export function useAudioAnalyser(): AudioAnalyserSource | null {
  return useContext(AudioAnalysisContext);
}
