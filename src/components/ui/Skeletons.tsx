import React from 'react';

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6" aria-label="Memuat ringkasan dashboard">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="h-32 rounded-2xl bg-[#171A17] p-5 flex flex-col justify-between">
        <div className="h-3 w-24 rounded skeleton-sheen-dark" />
        <div className="h-8 w-20 rounded skeleton-sheen-dark" />
        <div className="h-3 w-32 rounded skeleton-sheen-dark" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="h-3 w-28 rounded skeleton-sheen" />
          <div className="h-8 w-16 rounded skeleton-sheen" />
          <div className="h-3 w-36 rounded skeleton-sheen" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 h-72 rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
        <div className="h-4 w-48 rounded skeleton-sheen" />
        <div className="h-52 w-full rounded-xl skeleton-sheen" />
      </div>
      <div className="h-72 rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
        <div className="h-4 w-40 rounded skeleton-sheen" />
        <div className="h-14 w-full rounded-xl skeleton-sheen" />
        <div className="h-14 w-full rounded-xl skeleton-sheen" />
        <div className="h-14 w-full rounded-xl skeleton-sheen" />
      </div>
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-hidden" aria-label="Memuat tabel">
    <div className="p-4 border-b border-[#D5E4B6] flex gap-3">
      <div className="h-9 w-64 rounded-full skeleton-sheen" />
      <div className="h-9 w-32 rounded-full skeleton-sheen" />
    </div>
    <div className="divide-y divide-[#EBF3DA]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="h-4 w-24 rounded skeleton-sheen" />
          <div className="h-4 w-48 rounded skeleton-sheen flex-1 max-w-xs" />
          <div className="h-4 w-20 rounded skeleton-sheen hidden sm:block" />
          <div className="h-4 w-16 rounded skeleton-sheen" />
        </div>
      ))}
    </div>
  </div>
);

export const CardsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Memuat kartu">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-3">
        <div className="h-4 w-2/3 rounded skeleton-sheen" />
        <div className="h-3 w-1/2 rounded skeleton-sheen" />
        <div className="h-16 w-full rounded-xl skeleton-sheen" />
        <div className="flex justify-between pt-2">
          <div className="h-8 w-24 rounded-full skeleton-sheen" />
          <div className="h-8 w-28 rounded-full skeleton-sheen" />
        </div>
      </div>
    ))}
  </div>
);

export const RankingSkeleton: React.FC = () => (
  <div className="space-y-6" aria-label="Memuat peringkat">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
      <div className="h-40 rounded-2xl bg-white border border-[#D5E4B6] p-4 skeleton-sheen" />
      <div className="h-48 rounded-2xl bg-[#171A17] p-4 skeleton-sheen-dark" />
      <div className="h-36 rounded-2xl bg-white border border-[#D5E4B6] p-4 skeleton-sheen" />
    </div>
    <TableSkeleton rows={5} />
  </div>
);
