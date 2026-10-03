import React, { useState } from "react";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";

import {
  getCustomAISettings,
  saveCustomAISettings,
  DEFAULT_AI_SETTINGS,
} from "../data/customAISettings";

import type { CustomAISettings } from "../data/customAISettings";

export const AISettingsDialog: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [settings, setSettings] = useState<CustomAISettings>(() =>
    getCustomAISettings(),
  );
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    saveCustomAISettings(settings);
    setSavedSuccess(true);
    // Dispatch custom event to notify listeners immediately
    window.dispatchEvent(new Event("custom_ai_settings_updated"));
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_AI_SETTINGS });
  };

  return (
    <Dialog
      title="AI Configuration (Custom LLM)"
      onCloseRequest={onClose}
      size="small"
      className="AISettingsDialog"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          padding: "0.5rem 0",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            opacity: 0.8,
            lineHeight: 1.4,
          }}
        >
          Connect Excalidraw AI features directly to any OpenAI-compatible API
          endpoint (OpenAI, OpenRouter, Ollama, Groq, DeepSeek, etc.).
        </p>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "0.95rem",
          }}
        >
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, enabled: e.target.checked }))
            }
            style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer" }}
          />
          Enable Custom LLM Provider
        </label>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            opacity: settings.enabled ? 1 : 0.6,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 600,
                marginBottom: "0.25rem",
              }}
            >
              API Base URL
            </label>
            <TextField
              value={settings.baseURL}
              placeholder="https://api.openai.com/v1"
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, baseURL: value }))
              }
              fullWidth
            />
            <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
              For local Ollama use: http://localhost:11434/v1
            </span>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 600,
                marginBottom: "0.25rem",
              }}
            >
              API Key
            </label>
            <TextField
              value={settings.apiKey}
              placeholder="sk-... (optional for local models)"
              isRedacted
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, apiKey: value }))
              }
              fullWidth
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 600,
                marginBottom: "0.25rem",
              }}
            >
              Model Name (Text-to-Diagram)
            </label>
            <TextField
              value={settings.model}
              placeholder="gpt-4o, claude-3-5-sonnet, deepseek-chat, llama3..."
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, model: value }))
              }
              fullWidth
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 600,
                marginBottom: "0.25rem",
              }}
            >
              Vision Model Name (Diagram-to-Code)
            </label>
            <TextField
              value={settings.diagramToCodeModel || settings.model}
              placeholder="gpt-4o, claude-3-5-sonnet (must support vision)"
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, diagramToCodeModel: value }))
              }
              fullWidth
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--default-border-color)",
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-danger, #e03131)",
              cursor: "pointer",
              fontSize: "0.85rem",
              textDecoration: "underline",
              padding: "0.25rem 0.5rem",
            }}
          >
            Reset Defaults
          </button>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <DialogActionButton label="Cancel" onClick={onClose} />
            <DialogActionButton
              label={savedSuccess ? "Saved!" : "Save"}
              actionType="primary"
              onClick={handleSave}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
