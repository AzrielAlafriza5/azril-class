import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  History,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { CardsSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { formatWibDateTime } from '../../../shared/time';

interface RevisionItem {
  revision_number: number;
  submitted_at_utc: string;
  is_late: number;
  note: string;
  file_name: string;
  link_url: string;
}

interface RawAiAnalysis {
  status: 'COMPLETED' | 'UNAVAILABLE';
  file_status: string;
  completeness_status: string;
  match_percentage: number | null;
  summary: string;
  matched_parts_json: string;
  unmatched_parts_json: string;
  revision_recommendations_json: string;
  analyzed_at_utc: string;
}

interface GradeSubmissionRow {
  id: string;
  assignment_id: string;
  assignment_title: string;
  deadline_utc: string;
  submitted_at_utc: string;
  is_late: number;
  revision_count: number;
  status: string;
  is_verified: number;
  grade_id: string | null;
  score: number | null;
  feedback: string | null;
  needs_revision: number | null;
  graded_at_utc: string | null;
  revisions: RevisionItem[];
  aiAnalysis: RawAiAnalysis | null;
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export const StudentGradesPage: React.FC = () => {
  const [items, setItems] = useState<GradeSubmissionRow[]>([]);
  const [showAi, setShowAi] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: GradeSubmissionRow[]; showAiInitialScore: boolean }>('/api/student/grades');
      setItems(res.items);
      setShowAi(res.showAiInitialScore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat nilai dan evaluasi tugas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CardsSkeleton count={4} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const gradedItems = items.filter((i) => i.score !== null && i.score !== undefined);
  const avgScore =
    gradedItems.length > 0
      ? Math.round(gradedItems.reduce((acc, cur) => acc + Number(cur.score ?? 0), 0) / gradedItems.length)
      : null;
  const revisionNeededCount = items.filter((i) => i.status === 'NEEDS_REVISION' || Number(i.needs_revision) === 1).length;

  return (
    <div className="space-y-6">
      {/* Ringkasan Nilai */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#171A17] text-white p-5 flex flex-col justify-between">
          <span className="text-xs text-[#B5D45D] font-medium">Rata-Rata Nilai Resmi</span>
          <p className="text-3xl font-bold font-mono tabular-nums mt-2">
            {avgScore !== null ? `${avgScore}/100` : '—'}
          </p>
          <p className="text-xs text-[#DCECB8]/70 mt-1 tabular-nums">
            {gradedItems.length} dari {items.length} pengumpulan dinilai
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-[#536F1A]">Status Verifikasi Admin</span>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">
            {items.filter((i) => Number(i.is_verified) === 1).length} Terverifikasi
          </p>
          <p className="text-xs text-[#536F1A] mt-1">Penilaian final selalu ditetapkan Admin</p>
        </div>

        <div className="rounded-2xl bg-[#DCECB8]/60 border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-[#364B0F]">Perlu Revisi</span>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">{revisionNeededCount} Tugas</p>
          <p className="text-xs text-[#364B0F] mt-1">Riwayat revisi tetap tersimpan utuh</p>
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileCheck2 className="w-5 h-5" />}
          title="Belum Ada Pengumpulan Tugas"
          description="Nilai resmi Admin, catatan umpan balik, dan rekomendasi AI akan muncul di sini setelah Anda mengumpulkan tugas."
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const matchedParts = parseJsonArray(item.aiAnalysis?.matched_parts_json);
            const unmatchedParts = parseJsonArray(item.aiAnalysis?.unmatched_parts_json);
            const recommendations = parseJsonArray(item.aiAnalysis?.revision_recommendations_json);

            return (
              <article
                key={item.id}
                className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-medium text-[#536F1A]">
                      Dikumpulkan: {formatWibDateTime(item.submitted_at_utc)}
                      {Number(item.is_late) === 1 ? ' · Terlambat' : ' · Tepat Waktu'}
                      {` · ${Number(item.is_verified) === 1 ? 'Terverifikasi' : 'Menunggu Verifikasi'}`}
                    </p>
                    <h3 className="text-base font-bold text-[#20251D]">{item.assignment_title}</h3>
                    <p className="text-xs text-[#536F1A] font-mono tabular-nums">
                      Deadline: {formatWibDateTime(item.deadline_utc)} · Revisi ke-{item.revision_count}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {item.score !== null && item.score !== undefined ? (
                      <div className="rounded-2xl bg-[#171A17] text-white px-4 py-2 text-right">
                        <p className="text-[10px] text-[#B5D45D] font-semibold">Nilai Resmi</p>
                        <p className="text-xl font-bold font-mono tabular-nums">{item.score}</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-[#F0F8DF] border border-[#D5E4B6] px-4 py-2 text-right">
                        <p className="text-[10px] text-[#536F1A] font-semibold">Status</p>
                        <p className="text-xs font-bold text-[#20251D] flex items-center gap-1 mt-0.5">
                          {item.status === 'NEEDS_REVISION' ? (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              Perlu Revisi
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 text-[#536F1A]" />
                              Menunggu Nilai
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Umpan Balik Resmi Admin */}
                {item.feedback && (
                  <div className="rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] p-4 space-y-1">
                    <p className="text-xs font-bold text-[#364B0F] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Umpan Balik Admin {item.graded_at_utc ? `· ${formatWibDateTime(item.graded_at_utc)}` : ''}
                    </p>
                    <p className="text-sm text-[#20251D] whitespace-pre-line">{item.feedback}</p>
                  </div>
                )}

                {/* Evaluasi AI (Jika diizinkan oleh Admin) */}
                {showAi && item.aiAnalysis && (
                  <div className="rounded-xl bg-[#171A17] text-[#F0F8DF] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#B5D45D] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Analisis Asisten AI (Referensi Awal)
                      </p>
                      {item.aiAnalysis.status === 'COMPLETED' && item.aiAnalysis.match_percentage !== null && (
                        <span className="font-mono tabular-nums text-xs font-bold text-[#B5D45D]">
                          Kesesuaian: {item.aiAnalysis.match_percentage}%
                        </span>
                      )}
                    </div>

                    {item.aiAnalysis.status === 'UNAVAILABLE' ? (
                      <p className="text-xs text-[#DCECB8]/80">{item.aiAnalysis.summary}</p>
                    ) : (
                      <div className="space-y-2.5 text-xs">
                        <p className="text-[#DCECB8]/80">
                          File: <strong className="text-white">{item.aiAnalysis.file_status}</strong> · Kelengkapan:{' '}
                          <strong className="text-white">{item.aiAnalysis.completeness_status}</strong>
                        </p>
                        <p className="text-white/95 leading-relaxed">{item.aiAnalysis.summary}</p>

                        {matchedParts.length > 0 && (
                          <div>
                            <p className="font-semibold text-[#B5D45D] mb-1">Bagian yang Sudah Sesuai:</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-[#DCECB8]/90">
                              {matchedParts.map((m, idx) => (
                                <li key={idx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {unmatchedParts.length > 0 && (
                          <div>
                            <p className="font-semibold text-amber-300 mb-1">Bagian yang Belum Terpenuhi:</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-[#DCECB8]/90">
                              {unmatchedParts.map((u, idx) => (
                                <li key={idx}>{u}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {recommendations.length > 0 && (
                          <div>
                            <p className="font-semibold text-[#C5E370] mb-1">Rekomendasi Perbaikan:</p>
                            <ul className="list-disc pl-4 space-y-0.5 text-[#DCECB8]/90">
                              {recommendations.map((r, idx) => (
                                <li key={idx}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Riwayat Revisi */}
                {item.revisions.length > 0 && (
                  <div className="pt-2 border-t border-[#EBF3DA]">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#536F1A] hover:text-[#20251D]"
                    >
                      <History className="w-3.5 h-3.5" />
                      Riwayat Pengumpulan & Revisi ({item.revisions.length})
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {item.revisions.map((rev) => (
                          <div
                            key={rev.revision_number}
                            className="rounded-xl bg-[#F0F8DF]/70 border border-[#D5E4B6] p-3 text-xs flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <p className="font-semibold text-[#20251D]">
                                {rev.revision_number === 0 ? 'Pengumpulan Awal' : `Revisi ke-${rev.revision_number}`}{' '}
                                {Number(rev.is_late) === 1 ? '(Terlambat)' : '(Tepat Waktu)'}
                              </p>
                              {rev.note && <p className="text-[#536F1A] mt-0.5">{rev.note}</p>}
                              {(rev.file_name || rev.link_url) && (
                                <p className="text-[11px] font-mono text-[#20251D]/75 mt-0.5 truncate max-w-md">
                                  {rev.file_name || rev.link_url}
                                </p>
                              )}
                            </div>
                            <span className="font-mono tabular-nums text-[11px] text-[#536F1A]">
                              {formatWibDateTime(rev.submitted_at_utc)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
