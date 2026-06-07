"use client"
import { useState, useEffect } from "react"
import { API } from "@/lib/config"

interface GeminiModel {
  id: string
  display_name: string
  tier: number
  speed: string
  context_window: string
  best_for: string
  description: string
}

const HARDCODED_MODELS: GeminiModel[] = [
  {
    id: "gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
    tier: 0,
    speed: "fastest",
    context_window: "1M tokens",
    best_for: "Most investigations",
    description: "Default — best speed/accuracy balance",
  },
  {
    id: "gemini-2.5-flash-lite",
    display_name: "Gemini 2.5 Flash Lite",
    tier: 1,
    speed: "fast",
    context_window: "1M tokens",
    best_for: "High-volume / quota saving",
    description: "Lighter — activates on quota fallback",
  },
  {
    id: "gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    tier: 2,
    speed: "powerful",
    context_window: "2M tokens",
    best_for: "Complex PDFs, ambiguous cases",
    description: "Most powerful — slower, deepest reasoning",
  },
]

const SPEED_COLOR: Record<string, string> = {
  fastest: "rgba(34,197,94,0.85)",
  fast: "rgba(234,179,8,0.85)",
  powerful: "rgba(139,92,246,0.85)",
}

const SPEED_ICON: Record<string, string> = {
  fastest: "⚡",
  fast: "🔥",
  powerful: "🧠",
}

interface Props {
  selectedModel: string
  onModelChange: (id: string) => void
  disabled?: boolean
}

export default function ModelSelector({ selectedModel, onModelChange, disabled = false }: Props) {
  const [models, setModels] = useState<GeminiModel[]>(HARDCODED_MODELS)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    fetch(API.models())
      .then(r => r.json())
      .then(d => {
        if (d.models?.length && d.models[0].speed) setModels(d.models)
      })
      .catch(() => {})
  }, [])

  const selected = models.find(m => m.id === selectedModel) ?? models[0]

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => !disabled && setIsOpen(o => !o)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.7)",
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.08)" }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)" }}
      >
        <span>✦</span>
        <span style={{ color: SPEED_COLOR[selected.speed] ?? "rgba(255,255,255,0.6)" }}>
          {SPEED_ICON[selected.speed] ?? "●"}
        </span>
        <span>{selected.display_name}</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            className="absolute bottom-full mb-2 left-0 z-20 rounded-xl overflow-hidden w-72"
            style={{
              background: "hsl(240,20%,8%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                Gemini Model
              </p>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(66,133,244,0.12)",
                  color: "rgba(66,133,244,0.9)",
                  border: "1px solid rgba(66,133,244,0.25)",
                  fontSize: "0.62rem",
                }}
              >
                ✦ Google AI
              </span>
            </div>

            {/* Model options */}
            {models.map((model, idx) => (
              <button
                key={model.id}
                onClick={() => { onModelChange(model.id); setIsOpen(false) }}
                className="w-full text-left px-4 py-3 transition-colors"
                style={{
                  background: selectedModel === model.id ? "rgba(255,255,255,0.07)" : "transparent",
                  borderTop: idx === 0
                    ? "1px solid rgba(255,255,255,0.07)"
                    : "1px solid rgba(255,255,255,0.04)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)" }}
                onMouseLeave={e => {
                  e.currentTarget.style.background =
                    selectedModel === model.id ? "rgba(255,255,255,0.07)" : "transparent"
                }}
              >
                {/* Row 1: name + check */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: SPEED_COLOR[model.speed] ?? "rgba(255,255,255,0.6)" }}>
                      {SPEED_ICON[model.speed] ?? "●"}
                    </span>
                    <span className="text-sm font-medium text-white">{model.display_name}</span>
                    {selectedModel === model.id && (
                      <span style={{ color: "rgba(34,197,94,0.9)" }}>✓</span>
                    )}
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: SPEED_COLOR[model.speed] ?? "rgba(255,255,255,0.5)", fontSize: "0.65rem" }}
                  >
                    {model.speed}
                  </span>
                </div>

                {/* Row 2: description + context window */}
                <div className="flex items-center justify-between pl-6">
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {model.description}
                  </p>
                  <span
                    className="text-xs ml-2 flex-shrink-0"
                    style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.62rem" }}
                  >
                    {model.context_window}
                  </span>
                </div>

                {/* Row 3: best-for tag */}
                <div className="pl-6 mt-1">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.3)",
                      fontSize: "0.6rem",
                    }}
                  >
                    Best for: {model.best_for}
                  </span>
                </div>
              </button>
            ))}

            {/* Footer */}
            <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                Flash fires first. Lite/Pro activate automatically on quota or by your choice.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
