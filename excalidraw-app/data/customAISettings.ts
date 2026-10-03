export interface CustomAISettings {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
  diagramToCodeModel?: string;
}

const STORAGE_KEY = "excalidraw_custom_ai_settings";

export const DEFAULT_AI_SETTINGS: CustomAISettings = {
  enabled: false,
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  diagramToCodeModel: "gpt-4o",
};

export const getCustomAISettings = (): CustomAISettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_AI_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
    };
  } catch (e) {
    console.error("Failed to parse custom AI settings:", e);
    return { ...DEFAULT_AI_SETTINGS };
  }
};

export const saveCustomAISettings = (settings: CustomAISettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save custom AI settings:", e);
  }
};
