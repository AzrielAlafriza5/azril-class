import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePWAInstall';
import { Modal } from './Modal';

export const PWAInstallButton: React.FC<{ variant?: 'dark' | 'light' }> = ({ variant = 'light' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
          variant === 'dark'
            ? 'bg-[#B5D45D] text-[#171A17] hover:bg-[#C5E370]'
            : 'bg-[#171A17] text-[#F0F8DF] hover:bg-[#232822]'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        Pasang Aplikasi
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
            variant === 'dark'
              ? 'border-[#364B0F] text-[#DCECB8] hover:bg-[#232822]'
              : 'border-[#D5E4B6] bg-white text-[#20251D] hover:bg-[#DCECB8]/50'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Pasang di iOS
        </button>

        <Modal
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Pasang AZRIL CLAS di iPhone / iPad"
          subtitle="Akses cepat seperti aplikasi dari layar utama Safari"
        >
          <ol className="space-y-3 text-sm text-[#20251D]">
            <li className="p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6]">
              1. Ketuk tombol <strong>Bagikan (Share)</strong> pada bilah bawah atau atas browser Safari.
            </li>
            <li className="p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6]">
              2. Gulir ke bawah dan pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
            </li>
            <li className="p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6]">
              3. Ketuk <strong>Tambah</strong> untuk menyimpan AZRIL CLAS sebagai Web App.
            </li>
          </ol>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="mt-5 w-full rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] font-semibold py-2.5 text-sm transition-colors"
          >
            Mengerti
          </button>
        </Modal>
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-[#171A17] text-[#F0F8DF] border border-[#B5D45D] px-4 py-2 text-xs font-medium shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-[#B5D45D]" />
      <span>Mode Offline — Koneksi internet terputus</span>
    </div>
  );
};
