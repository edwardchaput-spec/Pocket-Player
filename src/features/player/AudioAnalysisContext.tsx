import { createContext, PropsWithChildren, useContext } from 'react';

const AudioAnalysisContext = createContext<AnalyserNode | null>(null);

export function AudioAnalysisProvider({
  analyser,
  children,
}: PropsWithChildren<{ analyser: AnalyserNode | null }>) {
  return <AudioAnalysisContext.Provider value={analyser}>{children}</AudioAnalysisContext.Provider>;
}

export function useAudioAnalyser(): AnalyserNode | null {
  return useContext(AudioAnalysisContext);
}
