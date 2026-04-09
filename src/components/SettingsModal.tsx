"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Check, Loader2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANTHROPIC_MODELS, OPENAI_MODELS } from "@/lib/ai-config";
import type { AIProvider } from "@/lib/ai-config";
import { motion } from "framer-motion";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SettingsState {
  provider: AIProvider;
  model: string;
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
  anthropicKeyHint: string;
  openaiKeyHint: string;
  canPersistApiKeys: boolean;
  apiKeyStorage: "local" | "workspace" | "environment";
  storageBackend: "local" | "vercel-blob";
  uploadMode: "blob" | "server" | "unsupported";
  workspaceId: string;
  legacySharedLibraryAvailable: boolean;
  hasPersonalData: boolean;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<SettingsState>({
    provider: "anthropic",
    model: "",
    hasAnthropicKey: false,
    hasOpenAIKey: false,
    anthropicKeyHint: "",
    openaiKeyHint: "",
    canPersistApiKeys: true,
    apiKeyStorage: "local",
    storageBackend: "local",
    uploadMode: "server",
    workspaceId: "",
    legacySharedLibraryAvailable: false,
    hasPersonalData: false,
  });
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/settings")
        .then(r => r.json())
        .then(data => setSettings(data))
        .catch(console.error);
    }
  }, [isOpen]);

  const models = settings.provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
  const activeModel = settings.model || models[0]?.id || "";

  const save = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model: activeModel,
          anthropicApiKey: settings.canPersistApiKeys ? (anthropicKey || undefined) : undefined,
          openaiApiKey: settings.canPersistApiKeys ? (openaiKey || undefined) : undefined,
        }),
      });
      // Refetch to update hints
      const updated = await fetch("/api/settings").then(r => r.json());
      setSettings(updated);
      setAnthropicKey("");
      setOpenaiKey("");
      setSavedAt(Date.now());
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">AI Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Provider selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3 block">
              AI Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["anthropic", "openai"] as AIProvider[]).map(p => (
                <button
                  key={p}
                  onClick={() => setSettings(s => ({ ...s, provider: p, model: "" }))}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                    settings.provider === p
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <ProviderLogo provider={p} />
                  <span className={cn(
                    "text-sm font-semibold",
                    settings.provider === p ? "text-blue-700 dark:text-blue-400" : "text-zinc-600 dark:text-zinc-400"
                  )}>
                    {p === "anthropic" ? "Anthropic" : "OpenAI"}
                  </span>
                  <span className={cn(
                    "text-[10px]",
                    settings.provider === p ? "text-blue-500 dark:text-blue-400" : "text-zinc-400"
                  )}>
                    {p === "anthropic" ? "Claude models" : "GPT-4o & o1"}
                  </span>
                  {(p === "anthropic" ? settings.hasAnthropicKey : settings.hasOpenAIKey) && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Key saved
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Model selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3 block">
              Model
            </label>
            <div className="space-y-1.5">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSettings(s => ({ ...s, model: m.id }))}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all text-left",
                    activeModel === m.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium",
                    activeModel === m.id ? "text-blue-700 dark:text-blue-400" : "text-zinc-600 dark:text-zinc-400"
                  )}>
                    {m.label}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-mono">{m.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Anthropic API key */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 block">
              Anthropic API Key
              {settings.hasAnthropicKey && <span className="ml-2 text-emerald-500 normal-case font-normal">({settings.anthropicKeyHint})</span>}
            </label>
            <div className="relative">
              <input
                type={showAnthropicKey ? "text" : "password"}
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                disabled={!settings.canPersistApiKeys}
                placeholder={
                  settings.canPersistApiKeys
                    ? (settings.hasAnthropicKey ? "Enter new key to replace..." : "sk-ant-...")
                    : "Set ANTHROPIC_API_KEY in your deployment environment"
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 pr-10 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => setShowAnthropicKey(s => !s)}
                disabled={!settings.canPersistApiKeys}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* OpenAI API key */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 block">
              OpenAI API Key
              {settings.hasOpenAIKey && <span className="ml-2 text-emerald-500 normal-case font-normal">({settings.openaiKeyHint})</span>}
            </label>
            <div className="relative">
              <input
                type={showOpenAIKey ? "text" : "password"}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                disabled={!settings.canPersistApiKeys}
                placeholder={
                  settings.canPersistApiKeys
                    ? (settings.hasOpenAIKey ? "Enter new key to replace..." : "sk-...")
                    : "Set OPENAI_API_KEY in your deployment environment"
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 pr-10 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => setShowOpenAIKey(s => !s)}
                disabled={!settings.canPersistApiKeys}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            {settings.canPersistApiKeys
              ? settings.apiKeyStorage === "workspace"
                ? "API keys are stored in your private workspace and only used for your own uploads and chats."
                : "API keys are stored in local app data and only sent to the selected AI provider."
              : "On hosted deployments, API keys must be set in environment variables. This public app no longer writes secrets into shared storage."}
          </p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Storage backend: {settings.storageBackend === "vercel-blob" ? "Vercel Blob" : "Local filesystem"}.
          </p>
          {settings.workspaceId && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              Workspace ID: <span className="font-mono">{settings.workspaceId.slice(0, 8)}</span>
            </p>
          )}
          <p className="text-xs text-zinc-400 leading-relaxed">
            This workspace stays with this browser. If you clear cookies or switch devices, the app will create a new workspace.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
          {savedAt && Date.now() - savedAt < 3000 ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Settings saved
            </span>
          ) : <span />}
          <button
            onClick={save}
            disabled={isSaving}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
              isSaving
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            )}
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Settings
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ProviderLogo({ provider }: { provider: AIProvider }) {
  if (provider === "anthropic") {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#CC785C] flex items-center justify-center text-white font-bold text-lg">
        A
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-[#10A37F] flex items-center justify-center text-white font-bold text-lg">
      G
    </div>
  );
}
