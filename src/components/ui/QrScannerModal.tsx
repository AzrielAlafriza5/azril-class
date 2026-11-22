import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, QrCode, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (token: string) => Promise<void>;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ open, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setCameraError(null);

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Browser tidak mendukung akses kamera langsung. Gunakan input token QR manual di bawah.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanLoop();
        }
      } catch {
        setCameraError(
          'Izin kamera tidak tersedia atau ditolak. Berikan izin kamera di browser atau masukkan kode token QR secara manual.'
        );
      }
    }

    const scanLoop = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w > 0 && h > 0) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);
            const code = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code && code.data && code.data.startsWith('AZR:')) {
              setSubmitting(true);
              void onDetected(code.data).finally(() => setSubmitting(false));
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, onDetected]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setSubmitting(true);
    try {
      await onDetected(manualToken.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan QR Absensi Luring"
      subtitle="Arahkan kamera ke QR Code dinamis yang ditampilkan Admin"
    >
      <div className="space-y-4">
        {!cameraError ? (
          <div className="relative rounded-2xl overflow-hidden bg-[#171A17] aspect-video flex items-center justify-center border border-[#D5E4B6]">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-44 h-44 rounded-2xl border-2 border-[#B5D45D] shadow-[0_0_0_9999px_rgba(23,26,23,0.38)]" />
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17]/85 text-[#F0F8DF] px-3 py-1 text-xs">
                <Camera className="w-3.5 h-3.5 text-[#B5D45D]" />
                {submitting ? 'Memverifikasi QR...' : 'Kamera aktif memindai QR Code'}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] p-4 flex items-start gap-3 text-sm text-[#20251D]">
            <AlertCircle className="w-5 h-5 text-[#536F1A] shrink-0 mt-0.5" />
            <p>{cameraError}</p>
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="space-y-2 pt-2 border-t border-[#D5E4B6]">
          <label className="block text-xs font-medium text-[#536F1A]">
            Atau masukkan Kode Token QR (jika kamera dibatasi perangkat)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Contoh: AZR:..."
              className="flex-1 rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
            />
            <button
              type="submit"
              disabled={submitting || !manualToken.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] disabled:opacity-50 text-[#171A17] font-semibold px-5 py-2 text-sm transition-colors whitespace-nowrap"
            >
              <QrCode className="w-4 h-4" />
              Kirim
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
