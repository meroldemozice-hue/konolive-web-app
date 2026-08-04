import React, { useRef, useState, useCallback } from 'react';
import { Camera, Upload, X, CheckCircle2, RefreshCw, SwitchCamera } from 'lucide-react';
import { toast } from 'sonner';

interface CameraCaptureProps {
  label: string;
  /** Optional icon displayed beside the label */
  icon?: React.ReactNode;
  /** captured File (from camera or file picker) */
  file: File | null;
  onChange: (f: File) => void;
  /** camera facing — 'environment' = rear, 'user' = front */
  facingMode?: 'environment' | 'user';
}

type Mode = 'idle' | 'camera' | 'preview';

export default function CameraCapture({ label, icon, file, onChange, facingMode = 'environment' }: CameraCaptureProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const [mode, setMode]               = useState<Mode>(file ? 'preview' : 'idle');
  const [previewUrl, setPreviewUrl]   = useState<string | null>(
    file ? URL.createObjectURL(file) : null
  );
  // Caméra active — peut être inversée pendant la capture
  const [activeFacing, setActiveFacing] = useState<'environment' | 'user'>(facingMode);
  const [flipping, setFlipping]         = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (facing: 'environment' | 'user') => {
    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: facing } },
      audio: false,
    };
    const s = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = s;
    setTimeout(() => {
      if (videoRef.current) videoRef.current.srcObject = s;
    }, 50);
  }, []);

  async function openCamera() {
    try {
      await startStream(activeFacing);
      setMode('camera');
    } catch {
      toast.error('Accès à la caméra refusé. Vérifiez les permissions.');
    }
  }

  /** Inverse la caméra (avant ↔ arrière) sans quitter le mode camera */
  async function flipCamera() {
    if (flipping) return;
    setFlipping(true);
    const next: 'environment' | 'user' = activeFacing === 'user' ? 'environment' : 'user';
    try {
      stopStream();
      await startStream(next);
      setActiveFacing(next);
    } catch {
      toast.error('Impossible de basculer la caméra.');
      // Retente avec l'ancienne caméra
      try { await startStream(activeFacing); } catch { /* abandon */ }
    } finally {
      setFlipping(false);
    }
  }

  function capture() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth  || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const captured = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(captured);
      stopStream();
      setPreviewUrl(url);
      setMode('preview');
      onChange(captured);
      toast.success('Photo capturée avec succès !');
    }, 'image/jpeg', 0.85);
  }

  function cancelCamera() {
    stopStream();
    setActiveFacing(facingMode); // réinitialise l'orientation
    setMode(file ? 'preview' : 'idle');
  }

  function retake() {
    setPreviewUrl(null);
    setActiveFacing(facingMode);
    setMode('idle');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setMode('preview');
    onChange(f);
    e.target.value = '';
  }

  return (
    <div>
      <label className="block text-sm font-normal text-foreground mb-2">
        <span className="inline-flex items-center gap-1.5">
          {icon && <span className="text-primary">{icon}</span>}
          {label}
        </span>
        {' '}<span className="text-destructive">*</span>
      </label>

      {mode === 'idle' && (
        <div className="neu-pressed rounded-xl p-5 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            Prenez une photo ou téléversez un fichier
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={openCamera}
              className="neu-btn flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Camera size={18} className="text-primary" />
              Caméra
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="neu-btn flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Upload size={18} className="text-primary" />
              Fichier
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {mode === 'camera' && (
        <div className="space-y-3">
          <div className="neu-pressed rounded-xl overflow-hidden aspect-[4/3] w-full relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform duration-300 ${activeFacing === 'user' ? 'scale-x-[-1]' : ''}`}
            />

            {/* Badge "En direct" */}
            <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              En direct
            </div>

            {/* Bouton inversion caméra */}
            <button
              type="button"
              onClick={flipCamera}
              disabled={flipping}
              title={activeFacing === 'user' ? 'Basculer vers caméra arrière' : 'Basculer vers caméra avant'}
              className="absolute top-2 right-2 w-9 h-9 rounded-xl flex items-center justify-center bg-black/50 hover:bg-black/70 text-white transition-all disabled:opacity-50"
            >
              <SwitchCamera size={18} className={flipping ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={capture}
              className="neu-btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Camera size={18} />
              Capturer
            </button>
            <button
              type="button"
              onClick={cancelCamera}
              className="neu-btn flex-1 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-destructive"
            >
              <X size={18} />
              Annuler
            </button>
          </div>
        </div>
      )}

      {mode === 'preview' && previewUrl && (
        <div className="space-y-2">
          <div className="neu-pressed rounded-xl overflow-hidden aspect-[4/3] w-full relative">
            <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 size={12} />
              Capturée
            </div>
          </div>
          <button
            type="button"
            onClick={retake}
            className="neu-btn w-full py-2 flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw size={15} />
            Reprendre
          </button>
        </div>
      )}
    </div>
  );
}
