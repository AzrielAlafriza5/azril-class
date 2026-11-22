import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import { UPLOADS_DIR } from '../db/database.ts';

export interface AiSubmissionAnalysisInput {
  assignmentTitle: string;
  assignmentDescription: string;
  studentName: string;
  nim: string;
  textAnswer: string;
  linkUrl: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
}

export interface AiSubmissionAnalysisOutput {
  status: 'COMPLETED' | 'UNAVAILABLE';
  fileStatus: string;
  completenessStatus: string;
  matchPercentage: number | null;
  summary: string;
  matchedParts: string[];
  unmatchedParts: string[];
  revisionRecommendations: string[];
  modelUsed: string;
  unavailableReason?: string;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export async function analyzeSubmissionWithGemini(
  input: AiSubmissionAnalysisInput
): Promise<AiSubmissionAnalysisOutput> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 'UNAVAILABLE',
      fileStatus: input.fileName ? `Terlampir: ${input.fileName}` : 'Tidak ada file',
      completenessStatus: 'Belum dianalisis AI (Integrasi Gemini belum aktif)',
      matchPercentage: null,
      summary:
        'Layanan Gemini AI belum dikonfigurasi pada server (GEMINI_API_KEY belum tersedia). Silakan lakukan peninjauan manual atau lengkapi konfigurasi API key di panel Secrets.',
      matchedParts: [],
      unmatchedParts: [],
      revisionRecommendations: [],
      modelUsed: 'none',
      unavailableReason: 'GEMINI_API_KEY belum dikonfigurasi pada server.',
    };
  }

  let filePreviewNote = input.fileName ? `File terlampir: ${input.fileName} (${input.mimeType})` : 'Tidak ada file terlampir';
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (input.storagePath) {
    const resolved = path.resolve(UPLOADS_DIR, input.storagePath);
    if (resolved.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(resolved)) {
      const stats = fs.statSync(resolved);
      const supportedInlineMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'];
      if (stats.size <= 4 * 1024 * 1024 && supportedInlineMimes.includes(input.mimeType)) {
        const base64 = fs.readFileSync(resolved).toString('base64');
        parts.push({
          inlineData: {
            mimeType: input.mimeType,
            data: base64,
          },
        });
        filePreviewNote = `File terlampir dan dibaca langsung: ${input.fileName} (${Math.round(stats.size / 1024)} KB)`;
      } else if (input.mimeType.startsWith('text/')) {
        const textContent = fs.readFileSync(resolved, 'utf8').slice(0, 8000);
        filePreviewNote = `File teks (${input.fileName}):\n${textContent}`;
      }
    }
  }

  const promptText = `Anda adalah Asisten Akademik Human-in-the-Loop pada platform AZRIL CLAS.
Tugas Anda adalah memberikan REKOMENDASI analisis kesesuaian jawaban mahasiswa untuk membantu Admin/Dosen. Anda TIDAK menentukan nilai akhir.

Judul Tugas: ${input.assignmentTitle}
Instruksi Tugas: ${input.assignmentDescription || '(Tidak ada deskripsi tambahan)'}

Mahasiswa: ${input.studentName} (${input.nim})
Status File: ${filePreviewNote}
Link URL/Drive: ${input.linkUrl || '(Tidak ada link)'}
Jawaban Teks: ${input.textAnswer || '(Tidak ada jawaban teks)'}

Berikan evaluasi terstruktur yang objektif dalam Bahasa Indonesia:
1. fileStatus: ringkasan status file/lampiran pengumpulan.
2. completenessStatus: apakah pengumpulan lengkap, kurang lengkap, atau hanya parsial.
3. matchPercentage: estimasi persentase kesesuaian (0-100) dengan instruksi tugas.
4. summary: ringkasan singkat (2-3 kalimat) kualitas pengumpulan.
5. matchedParts: poin-poin bagian yang sudah sesuai instruksi.
6. unmatchedParts: poin-poin yang belum sesuai atau masih kurang.
7. revisionRecommendations: saran revisi yang konkret jika diperlukan.`;

  parts.push({ text: promptText });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fileStatus: { type: Type.STRING },
            completenessStatus: { type: Type.STRING },
            matchPercentage: { type: Type.INTEGER },
            summary: { type: Type.STRING },
            matchedParts: { type: Type.ARRAY, items: { type: Type.STRING } },
            unmatchedParts: { type: Type.ARRAY, items: { type: Type.STRING } },
            revisionRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            'fileStatus',
            'completenessStatus',
            'matchPercentage',
            'summary',
            'matchedParts',
            'unmatchedParts',
            'revisionRecommendations',
          ],
        },
      },
    });

    const raw = (response.text ?? '').trim();
    const parsed = JSON.parse(raw) as {
      fileStatus: string;
      completenessStatus: string;
      matchPercentage: number;
      summary: string;
      matchedParts: string[];
      unmatchedParts: string[];
      revisionRecommendations: string[];
    };

    return {
      status: 'COMPLETED',
      fileStatus: parsed.fileStatus || filePreviewNote,
      completenessStatus: parsed.completenessStatus || 'Lengkap',
      matchPercentage: Math.max(0, Math.min(100, Math.round(Number(parsed.matchPercentage) || 0))),
      summary: parsed.summary || '',
      matchedParts: Array.isArray(parsed.matchedParts) ? parsed.matchedParts : [],
      unmatchedParts: Array.isArray(parsed.unmatchedParts) ? parsed.unmatchedParts : [],
      revisionRecommendations: Array.isArray(parsed.revisionRecommendations)
        ? parsed.revisionRecommendations
        : [],
      modelUsed: 'gemini-4-hydrogen',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghubungi layanan Gemini AI';
    return {
      status: 'UNAVAILABLE',
      fileStatus: filePreviewNote,
      completenessStatus: 'Analisis AI gagal diproses',
      matchPercentage: null,
      summary: `Analisis AI tidak dapat diselesaikan saat ini (${message}). Tidak ada skor simulasi yang dibuat; silakan evaluasi secara manual.`,
      matchedParts: [],
      unmatchedParts: [],
      revisionRecommendations: [],
      modelUsed: 'gemini-4-hydrogen',
      unavailableReason: message,
    };
  }
}
