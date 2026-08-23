"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import documentsData from "@/data/generated/documents.json";
import {
  X,
  FileText,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DocMeta = {
  doc_id: string;
  file: string;
  title: string;
  type: string;
  status: string;
  authority_tier: number;
  effective_date: string;
  supersedes?: string;
  superseded_by?: string;
  applies_to: string[];
  chunks: number;
};

type DocChunk = {
  chunk_id: string;
  doc_id: string;
  seq: number;
  title: string;
  text: string;
};

const documents = documentsData.documents as DocMeta[];
const chunks = documentsData.chunks as DocChunk[];

type DocViewerContextType = {
  openDoc: (docId: string, sectionTarget?: string) => void;
  closeDoc: () => void;
};

const DocViewerContext = createContext<DocViewerContextType>({
  openDoc: () => {},
  closeDoc: () => {},
});

export const useDocViewer = () => useContext(DocViewerContext);

export function DocViewerProvider({ children }: { children: ReactNode }) {
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [targetSection, setTargetSection] = useState<string | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  const openDoc = (docId: string, sectionTarget?: string) => {
    const matchedDoc = documents.find(
      (d) => d.doc_id.toUpperCase() === docId.toUpperCase()
    );
    if (!matchedDoc) return;
    setActiveDocId(matchedDoc.doc_id);
    setTargetSection(sectionTarget ?? null);

    // Auto-select chunk if section matches
    const docChunks = chunks.filter((c) => c.doc_id === matchedDoc.doc_id);
    if (sectionTarget && docChunks.length > 0) {
      const normalizedTarget = sectionTarget.toLowerCase().trim();
      const matched = docChunks.find(
        (c) =>
          c.title.toLowerCase().includes(normalizedTarget) ||
          c.seq.toString() === normalizedTarget ||
          normalizedTarget.includes(c.seq.toString())
      );
      setSelectedChunkId(matched ? matched.chunk_id : docChunks[0].chunk_id);
    } else if (docChunks.length > 0) {
      setSelectedChunkId(docChunks[0].chunk_id);
    }
  };

  const closeDoc = () => {
    setActiveDocId(null);
    setTargetSection(null);
    setSelectedChunkId(null);
  };

  const activeDoc = documents.find((d) => d.doc_id === activeDocId);
  const docChunks = activeDocId ? chunks.filter((c) => c.doc_id === activeDocId) : [];
  const activeChunk = docChunks.find((c) => c.chunk_id === selectedChunkId) ?? docChunks[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  return (
    <DocViewerContext.Provider value={{ openDoc, closeDoc }}>
      {children}

      {/* Slide-Over Modal Backdrop */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
          {/* Modal Container */}
          <div className="relative w-full max-w-2xl bg-card border-l border-border shadow-2xl h-full flex flex-col overflow-hidden animate-fade-up">
            
            {/* Modal Header */}
            <div className="shrink-0 border-b border-border bg-secondary/30 px-6 py-4 flex items-start justify-between">
              <div className="space-y-1.5 pr-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                    {activeDoc.doc_id}
                  </span>
                  
                  {/* Status Badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
                      activeDoc.status === "CURRENT" || activeDoc.status === "ACTIVE"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    )}
                  >
                    {activeDoc.status === "CURRENT" || activeDoc.status === "ACTIVE" ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                    )}
                    {activeDoc.status}
                  </span>

                  {/* Type Badge */}
                  <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[10.5px] font-mono text-muted-foreground">
                    {activeDoc.type}
                  </span>
                </div>

                <h2 className="font-serif text-xl font-bold text-foreground leading-snug">
                  {activeDoc.title}
                </h2>

                <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground pt-0.5">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-primary" /> {activeDoc.file}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Effective: {activeDoc.effective_date}
                  </span>
                  <span className="font-mono text-[11px] bg-secondary px-1.5 py-0.5 rounded">
                    Tier {activeDoc.authority_tier}
                  </span>
                </div>

                {activeDoc.status === "DEPRECATED" && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Warning:</strong> This document is DEPRECATED and superseded by current guidance.
                    </span>
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={closeDoc}
                className="rounded-full shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Modal Body: Two-column layout (Section Nav + Section Excerpt) */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-border">
              
              {/* Left Column: Sections List */}
              <div className="w-full md:w-56 shrink-0 bg-secondary/20 p-3 overflow-y-auto space-y-1">
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">
                  Document Sections ({docChunks.length})
                </p>
                {docChunks.map((chunk) => {
                  const isSelected = chunk.chunk_id === selectedChunkId;
                  const isTarget =
                    targetSection &&
                    chunk.title.toLowerCase().includes(targetSection.toLowerCase());

                  return (
                    <button
                      key={chunk.chunk_id}
                      onClick={() => setSelectedChunkId(chunk.chunk_id)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-xl text-[12px] transition-all flex items-start justify-between gap-1.5 cursor-pointer",
                        isSelected
                          ? "bg-card border border-primary/30 text-foreground font-semibold shadow-2xs"
                          : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                        isTarget && !isSelected && "border border-amber-300 bg-amber-50/40 text-amber-900"
                      )}
                    >
                      <div className="space-y-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground block">
                          Chunk {chunk.seq}
                        </span>
                        <span className="line-clamp-2 leading-snug">{chunk.title}</span>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 mt-1 transition-transform",
                          isSelected ? "text-primary translate-x-0.5" : "text-muted-foreground/30"
                        )}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Chunk Viewer & Excerpt */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {activeChunk ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                      <div>
                        <span className="font-mono text-[11px] text-primary font-bold">
                          {activeChunk.chunk_id}
                        </span>
                        <h3 className="font-serif text-lg font-bold text-foreground">
                          {activeChunk.title}
                        </h3>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(activeChunk.text, activeChunk.chunk_id)}
                        className="h-8 text-xs gap-1.5 rounded-full"
                      >
                        {copiedChunkId === activeChunk.chunk_id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy Clause
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Section Text Excerpt */}
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                        Official Policy Text Clause:
                      </p>
                      <pre className="font-sans text-[13.5px] leading-relaxed text-foreground whitespace-pre-wrap">
                        {activeChunk.text}
                      </pre>
                    </div>

                    {/* Precedence Context Callout */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-[11.5px] text-foreground flex items-start gap-2.5">
                      <BookOpen className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        <strong>Ops Verification Note:</strong> Citations in ParcelPilot are backed by the single ground-truth dataset snapshot. If an enterprise agreement applies to the account, its clause overrides standard policy defaults.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a section to inspect text.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="shrink-0 border-t border-border bg-secondary/30 px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>ParcelPilot Policy &amp; Contract Inspector</span>
              <Button size="sm" variant="ghost" onClick={closeDoc} className="h-7 text-xs">
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </DocViewerContext.Provider>
  );
}
