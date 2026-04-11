import { App, Modal } from "obsidian";

export interface PatchPromptOptions {
  title: string;
  diff: string;
  originalContent: string;
  proposedContent: string;
  filePath: string;
}

export type PatchDecision =
  | { action: "apply"; content: string }
  | { action: "reject" };

export function promptPatch(app: App, options: PatchPromptOptions): Promise<PatchDecision> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (decision: PatchDecision) => {
      if (resolved) return;
      resolved = true;
      resolve(decision);
    };
    const modal = new Modal(app);
    modal.titleEl.setText(options.title);

    const body = modal.contentEl;
    body.addClass("claude-patch-modal");

    body.createEl("div", {
      cls: "claude-patch-subtitle",
      text: options.filePath,
    });

    const diffEl = body.createEl("pre", {
      cls: "claude-patch-diff",
    });
    diffEl.textContent = options.diff;

    const buttonRow = body.createEl("div", { cls: "claude-patch-actions" });

    const applyButton = buttonRow.createEl("button", {
      text: "Apply",
      cls: "mod-cta",
    });
    applyButton.onclick = () => {
      finish({ action: "apply", content: options.proposedContent });
      modal.close();
    };

    const editButton = buttonRow.createEl("button", {
      text: "Edit then apply",
    });
    editButton.onclick = async () => {
      modal.close();
      const edited = await promptPatchEdit(app, options);
      if (edited !== null) {
        finish({ action: "apply", content: edited });
      } else {
        finish({ action: "reject" });
      }
    };

    const rejectButton = buttonRow.createEl("button", {
      text: "Reject",
      cls: "mod-warning",
    });
    rejectButton.onclick = () => {
      finish({ action: "reject" });
      modal.close();
    };

    modal.onClose = () => {
      finish({ action: "reject" });
    };

    modal.open();
  });
}

function promptPatchEdit(app: App, options: PatchPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const modal = new Modal(app);
    modal.titleEl.setText(`Edit patch: ${options.filePath}`);

    const body = modal.contentEl;
    body.addClass("claude-patch-modal");

    const input = body.createEl("textarea", {
      cls: "claude-patch-editor",
    });
    input.value = options.proposedContent;

    const buttonRow = body.createEl("div", { cls: "claude-patch-actions" });

    const applyButton = buttonRow.createEl("button", {
      text: "Apply edits",
      cls: "mod-cta",
    });
    applyButton.onclick = () => {
      finish(input.value);
      modal.close();
    };

    const cancelButton = buttonRow.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => {
      finish(null);
      modal.close();
    };

    modal.onClose = () => {
      finish(null);
    };

    modal.open();
  });
}
