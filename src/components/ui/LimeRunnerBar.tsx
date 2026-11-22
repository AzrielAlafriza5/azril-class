import React, { useEffect, useState } from 'react';
import { subscribeLoading } from '../../lib/api';

export const LimeRunnerBar: React.FC<{ forceActive?: boolean }> = ({ forceActive = false }) => {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    return subscribeLoading(setActiveCount);
  }, []);

  const isVisible = forceActive || activeCount > 0;
  if (!isVisible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden bg-[#DCECB8]"
      role="progressbar"
      aria-label="Memuat data"
    >
      <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#536F1A] via-[#B5D45D] to-[#C5E370] animate-lime-runner" />
    </div>
  );
};
