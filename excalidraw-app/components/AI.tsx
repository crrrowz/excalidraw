import {
  DiagramToCodePlugin,
  exportToBlob,
  getNonDeletedElements,
  getTextFromElements,
  MIME_TYPES,
  parseSSEStream,
  TTDDialog,
  TTDStreamFetch,
} from "@excalidraw/excalidraw";
import { getDataURL } from "@excalidraw/excalidraw/data/blob";
import { safelyParseJSON } from "@excalidraw/common";
import { RequestError } from "@excalidraw/excalidraw/errors";

import type { StreamChunk } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { TTDIndexedDBAdapter } from "../data/TTDStorage";
import { getCustomAISettings } from "../data/customAISettings";
import {
  customDiagramToCodeGenerate,
  customTTDStreamFetch,
} from "../data/customAIClient";

export const AIComponents = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  return (
    <>
      <DiagramToCodePlugin
        generate={async ({ frame, children, onPartial }) => {
          const appState = excalidrawAPI.getAppState();

          // SAFETY: This should never happen, but log it just in case
          if (children.some((el) => el.isDeleted)) {
            console.error(
              "[NONDELETED][INVARIANT] Generated children elements should not be `isDeleted: true`",
            );
          }

          const blob = await exportToBlob({
            elements: getNonDeletedElements(children),
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor,
            },
            exportingFrame: frame,
            files: excalidrawAPI.getFiles(),
            mimeType: MIME_TYPES.jpg,
          });

          const dataURL = await getDataURL(blob);

          const textFromFrameChildren = getTextFromElements(children);

          const customSettings = getCustomAISettings();
          if (customSettings.enabled && customSettings.baseURL) {
            return customDiagramToCodeGenerate({
              settings: customSettings,
              dataURL,
              texts: textFromFrameChildren ? [textFromFrameChildren] : [],
              theme: appState.theme,
              onPartial,
            });
          }

          if (!customSettings.enabled) {
            return {
              html: `<html>
              <body style="margin: 0; text-align: center; font-family: sans-serif;">
              <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: 100vh; padding: 0 40px">
                <h3 style="color:#e03131">Custom AI is Disabled</h3>
                <p>Please open the main menu (☰) &gt; <b>AI Settings</b> to enable your custom LLM and enter your API credentials.</p>
              </div>
              </body>
              </html>`,
            };
          }

          const response = await fetch(
            `${
              import.meta.env.VITE_APP_AI_BACKEND
            }/v1/ai/diagram-to-code/generate-streaming`,
            {
              method: "POST",
              headers: {
                Accept: "text/event-stream",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                texts: textFromFrameChildren,
                image: dataURL,
                theme: appState.theme,
              }),
            },
          );

          if (!response.ok) {
            const text = await response.text();
            const errorJSON = safelyParseJSON(text);

            if (!errorJSON) {
              throw new Error(text);
            }

            if (errorJSON.statusCode === 429) {
              return {
                html: `<html>
                <body style="margin: 0; text-align: center">
                <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: 100vh; padding: 0 60px">
                  <div style="color:red">Too many requests today,</br>please try again tomorrow!</div>
                  </br>
                  </br>
                  <div>You can also try <a href="${
                    import.meta.env.VITE_APP_PLUS_LP
                  }/plus?utm_source=excalidraw&utm_medium=app&utm_content=d2c" target="_blank" rel="noopener">Excalidraw+</a> to get more requests.</div>
                </div>
                </body>
                </html>`,
              };
            }

            throw new Error(errorJSON.message || text);
          }

          const reader = response.body?.getReader();

          if (!reader) {
            throw new Error("Generation failed (invalid response)");
          }

          let html = "";
          let streamError: Error | null = null;

          for await (const data of parseSSEStream(reader)) {
            if (data === "[DONE]") {
              break;
            }

            const chunk = safelyParseJSON(data) as StreamChunk | null;

            if (!chunk) {
              continue;
            }

            switch (chunk.type) {
              case "content": {
                if (chunk.delta) {
                  html += chunk.delta;
                  onPartial?.(html);
                }
                break;
              }
              case "error": {
                streamError = new Error(
                  chunk.error.message || "Generation failed",
                );
                break;
              }
              case "done": {
                break;
              }
            }
          }

          if (streamError) {
            throw streamError;
          }

          if (!html.trim()) {
            throw new Error("Generation failed (invalid response)");
          }

          return {
            html,
          };
        }}
      />

      <TTDDialog
        onTextSubmit={async (props) => {
          const { onChunk, onStreamCreated, signal, messages } = props;

          const customSettings = getCustomAISettings();
          if (customSettings.enabled && customSettings.baseURL) {
            return customTTDStreamFetch({
              settings: customSettings,
              messages,
              onChunk,
              onStreamCreated,
              signal,
            });
          }

          if (!customSettings.enabled) {
            return {
              error: new RequestError({
                message:
                  "Custom AI is disabled. Please enable it in 'AI Settings' from the main menu and set your API key/endpoint.",
                status: 400,
              }),
            };
          }

          const result = await TTDStreamFetch({
            url: `${
              import.meta.env.VITE_APP_AI_BACKEND
            }/v1/ai/text-to-diagram/chat-streaming`,
            messages,
            onChunk,
            onStreamCreated,
            extractRateLimits: true,
            signal,
          });

          return result;
        }}
        persistenceAdapter={TTDIndexedDBAdapter}
      />
    </>
  );
};
