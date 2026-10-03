import { parseSSEStream } from "@excalidraw/excalidraw";
import { RequestError } from "@excalidraw/excalidraw/errors";

import type {
  LLMMessage,
  TTTDDialog,
} from "@excalidraw/excalidraw/components/TTDDialog/types";

import type { CustomAISettings } from "./customAISettings";

const MERMAID_SYSTEM_PROMPT = `You are an expert at creating diagrams using Mermaid.js syntax for Excalidraw.
When given a user prompt or modification request:
1. Return ONLY the valid Mermaid.js code block or raw Mermaid syntax.
2. Do not include markdown code block backticks (like \`\`\`mermaid) if possible, or if included, start immediately with Mermaid definition (e.g., flowchart TD, sequenceDiagram, classDiagram, erDiagram, etc.).
3. Do not include conversational text or explanation. Only return the valid diagram definition.
4. Ensure node labels and text are clear and properly quoted if containing special characters or punctuation.`;

const DIAGRAM_TO_CODE_SYSTEM_PROMPT = `You are an expert frontend developer and UI/UX designer.
The user has provided a wireframe/diagram image created in Excalidraw, along with text elements extracted from it.
Your job is to generate a modern, responsive, visually appealing single-file HTML page containing full Tailwind CSS (via CDN: <script src="https://cdn.tailwindcss.com"></script>) and any needed inline styles or interactive scripts.
1. Return ONLY the complete HTML document starting with <!DOCTYPE html>.
2. Do not include markdown fences like \`\`\`html or conversational text.
3. Match the layout, structure, labels, hierarchy, and color scheme requested or depicted.
4. Make it look professional and polished with modern padding, rounded corners, shadows, and fonts.`;

function cleanMermaidOutput(text: string): string {
  let cleaned = text.trim();
  // Strip ```mermaid or ``` if present
  if (cleaned.startsWith("```mermaid")) {
    cleaned = cleaned.replace(/^```mermaid\s*/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

function cleanHTMLOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```html")) {
    cleaned = cleaned.replace(/^```html\s*/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

/**
 * Custom Text-to-Diagram streaming client using OpenAI-compatible Chat Completions API
 */
export async function customTTDStreamFetch({
  settings,
  messages,
  onChunk,
  onStreamCreated,
  signal,
}: {
  settings: CustomAISettings;
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  onStreamCreated?: () => void;
  signal?: AbortSignal;
}): Promise<TTTDDialog.OnTextSubmitRetValue> {
  const endpoint = `${settings.baseURL.replace(/\/+$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  const payload = {
    model: settings.model.trim() || "gpt-4o",
    messages: [
      { role: "system", content: MERMAID_SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
    stream: true,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.error?.message || errText;
      } catch {
        // ignore json parse error
      }
      throw new RequestError({
        message: errorMsg || `HTTP error ${response.status}`,
        status: response.status,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new RequestError({
        message: "Failed to read response stream from custom LLM",
        status: 500,
      });
    }

    onStreamCreated?.();

    let fullGenerated = "";

    for await (const data of parseSSEStream(reader)) {
      if (data === "[DONE]") {
        break;
      }

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullGenerated += delta;
          onChunk?.(delta);
        }
      } catch (e) {
        // Ignore unparseable chunks
      }
    }

    return {
      rateLimit: null,
      rateLimitRemaining: null,
      generatedResponse: cleanMermaidOutput(fullGenerated),
      error: null,
    };
  } catch (error: any) {
    const isAborted =
      error.name === "AbortError" ||
      error.message === "Aborted" ||
      signal?.aborted;

    if (isAborted) {
      return {
        error: new RequestError({
          message: "Request aborted",
          status: 499,
        }),
      };
    }

    return {
      error:
        error instanceof RequestError
          ? error
          : new RequestError({
              message: error.message || "Custom LLM request failed",
              status: 500,
            }),
    };
  }
}

/**
 * Custom Diagram-to-Code streaming client using OpenAI-compatible Vision Chat Completions API
 */
export async function customDiagramToCodeGenerate({
  settings,
  dataURL,
  texts,
  theme,
  onPartial,
}: {
  settings: CustomAISettings;
  dataURL: string;
  texts: string[];
  theme: string;
  onPartial?: (html: string) => void;
}): Promise<{ html: string }> {
  const endpoint = `${settings.baseURL.replace(/\/+$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  const modelToUse = (
    settings.diagramToCodeModel ||
    settings.model ||
    "gpt-4o"
  ).trim();

  const userContent: any[] = [
    {
      type: "text",
      text: `Convert this diagram into a complete, clean, responsive HTML page.\nTheme: ${theme}\nExtracted text elements from diagram: ${texts.join(
        ", ",
      )}`,
    },
    {
      type: "image_url",
      image_url: {
        url: dataURL,
      },
    },
  ];

  const payload = {
    model: modelToUse,
    messages: [
      { role: "system", content: DIAGRAM_TO_CODE_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    stream: true,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errorMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      errorMsg = parsed.error?.message || errText;
    } catch {
      // ignore
    }
    throw new Error(
      errorMsg || `Custom LLM generation failed: HTTP ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Generation failed (no readable stream)");
  }

  let fullHtml = "";

  for await (const data of parseSSEStream(reader)) {
    if (data === "[DONE]") {
      break;
    }

    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content || "";
      if (delta) {
        fullHtml += delta;
        onPartial?.(cleanHTMLOutput(fullHtml));
      }
    } catch {
      // ignore
    }
  }

  const cleaned = cleanHTMLOutput(fullHtml);
  if (!cleaned.trim()) {
    throw new Error("Custom LLM generation returned empty response");
  }

  return { html: cleaned };
}
