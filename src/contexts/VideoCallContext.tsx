/**
 * VideoCallContext — Gestionnaire global d'appel vidéo flottant
 *
 * Maintient l'état de l'appel actif en dehors du cycle de vie des pages.
 * Seul le composant FloatingVideoCall (monté à la racine de l'app) consomme
 * cet état, ce qui garantit que la session WebRTC ne soit jamais détruite
 * lors d'une navigation.
 */
import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ActiveCallParams {
  callId: string;
  remoteUserName: string;
  remoteUserPhoto?: string | null;
  isInitiator: boolean;
  requestId: string;
}

interface VideoCallContextValue {
  /** Paramètres de l'appel actif, null si aucun appel en cours */
  activeCall: ActiveCallParams | null;
  /** Démarre ou remplace l'appel actif */
  startCall: (params: ActiveCallParams) => void;
  /** Termine et efface l'appel actif */
  endCall: () => void;
  /** Fenêtre réduite (mini PiP) ou plein format */
  minimized: boolean;
  setMinimized: (v: boolean) => void;
}

// Valeur par défaut no-op — évite tout crash pendant le React Fast Refresh (HMR)
// et garantit que useVideoCall ne lève jamais d'exception hors provider.
const defaultValue: VideoCallContextValue = {
  activeCall: null,
  startCall: () => {},
  endCall:   () => {},
  minimized: false,
  setMinimized: () => {},
};

const VideoCallContext = createContext<VideoCallContextValue>(defaultValue);

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCallParams | null>(null);
  const [minimized, setMinimized]   = useState(false);

  const startCall = useCallback((params: ActiveCallParams) => {
    setActiveCall(params);
    setMinimized(false);
  }, []);

  const endCall = useCallback(() => {
    setActiveCall(null);
    setMinimized(false);
  }, []);

  return (
    <VideoCallContext.Provider value={{ activeCall, startCall, endCall, minimized, setMinimized }}>
      {children}
    </VideoCallContext.Provider>
  );
}

export function useVideoCall(): VideoCallContextValue {
  return useContext(VideoCallContext);
}
