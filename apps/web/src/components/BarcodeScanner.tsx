// Scanner de code-barres par caméra — utilise l'API native
// `BarcodeDetector` quand elle existe (Chrome/Edge/Android), sinon
// bascule sur ZXing chargé à la demande (Safari, Firefox).
// Nécessite HTTPS (ou localhost) : getUserMedia est une API sécurisée.

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
    };
  }
}

export function BarcodeScanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    let stream: MediaStream | null = null;
    let interval: ReturnType<typeof setInterval> | undefined;
    let controls: { stop: () => void } | null = null;
    let mounted = true;

    const found = (code: string) => {
      if (!done && code) {
        done = true;
        onDetect(code);
      }
    };

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;

      if (window.BarcodeDetector) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (!mounted) return;
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        });
        interval = setInterval(async () => {
          if (done) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]) found(codes[0].rawValue);
          } catch {
            /* frame non lisible — on reteste à la suivante */
          }
        }, 350);
        return;
      }

      // Fallback ZXing — chunk chargé seulement si nécessaire.
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (!mounted) return;
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) found(result.getText());
      });
    };

    start().catch(() => {
      if (mounted) setError("Caméra inaccessible — autorise l'accès dans le navigateur ou tape le code à la main.");
    });

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl bg-warn/10 px-3 py-3 text-xs text-warn">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-line/60 bg-black">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-accent/80" />
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] font-bold uppercase tracking-wider text-white/70">
            Cadre le code-barres
          </p>
        </div>
      )}
      <Button variant="secondary" className="w-full" onClick={onClose}>
        <X className="size-4" /> Fermer le scanner
      </Button>
    </div>
  );
}

export function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      <Camera className="size-4" /> Scanner
    </Button>
  );
}
