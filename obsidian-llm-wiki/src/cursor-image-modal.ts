import { App, Modal } from "obsidian";

export interface CursorGenerateImageRequest {
  description: string;
  filePath?: string;
  referenceImagePaths?: string[];
}

export type CursorGenerateImageDecision =
  | { outcome: "generated"; filePath: string }
  | { outcome: "skipped"; reason?: string }
  | { outcome: "cancelled" };

export function promptCursorImageGeneration(
  app: App,
  request: CursorGenerateImageRequest,
): Promise<CursorGenerateImageDecision> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (decision: CursorGenerateImageDecision) => {
      if (resolved) return;
      resolved = true;
      resolve(decision);
    };

    const modal = new Modal(app);
    modal.titleEl.setText("Generate image");

    const body = modal.contentEl;
    body.addClass("cursor-image-modal");

    body.createEl("div", {
      cls: "cursor-image-description",
      text: request.description.trim(),
    });

    const pathInput = body.createEl("input", {
      cls: "cursor-image-path-input",
      attr: {
        type: "text",
        placeholder: "Output path",
      },
    });
    pathInput.value = request.filePath?.trim() || "";

    if (Array.isArray(request.referenceImagePaths) && request.referenceImagePaths.length > 0) {
      const refs = body.createEl("div", { cls: "cursor-image-refs" });
      refs.createEl("div", {
        cls: "cursor-plan-section-title",
        text: "Reference images",
      });
      const list = refs.createEl("ul", {
        cls: "cursor-plan-todo-list",
      });
      for (const ref of request.referenceImagePaths) {
        list.createEl("li", { text: ref });
      }
    }

    const actions = body.createEl("div", { cls: "cursor-plan-actions" });

    const cancelButton = actions.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => {
      finish({ outcome: "cancelled" });
      modal.close();
    };

    const skipButton = actions.createEl("button", {
      text: "Skip",
    });
    skipButton.onclick = () => {
      finish({
        outcome: "skipped",
        reason: "Skipped by user",
      });
      modal.close();
    };

    const generateButton = actions.createEl("button", {
      text: "Generate SVG",
      cls: "mod-cta",
    });
    generateButton.onclick = () => {
      const targetPath = pathInput.value.trim();
      if (!targetPath) {
        return;
      }
      finish({
        outcome: "generated",
        filePath: targetPath,
      });
      modal.close();
    };

    modal.onClose = () => {
      finish({ outcome: "cancelled" });
    };

    modal.open();
  });
}
