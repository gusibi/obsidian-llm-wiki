import { App, Modal } from "obsidian";

export interface TerminalPermissionRequest {
  command: string;
  classification: "safe" | "test" | "danger";
}

export type TerminalPermissionDecision = "allow" | "reject";

export function promptTerminalPermission(
  app: App,
  request: TerminalPermissionRequest,
): Promise<TerminalPermissionDecision> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (decision: TerminalPermissionDecision) => {
      if (resolved) return;
      resolved = true;
      resolve(decision);
    };
    const modal = new Modal(app);
    modal.titleEl.setText("Terminal command requested");

    const body = modal.contentEl;
    body.addClass("claude-terminal-modal");

    body.createEl("div", {
      cls: "claude-terminal-label",
      text: `Classification: ${request.classification}`,
    });

    const commandEl = body.createEl("pre", {
      cls: "claude-terminal-command",
    });
    commandEl.textContent = request.command;

    const actions = body.createEl("div", { cls: "claude-terminal-actions" });

    const allowButton = actions.createEl("button", {
      text: "Allow",
      cls: "mod-cta",
    });
    allowButton.onclick = () => {
      finish("allow");
      modal.close();
    };

    const rejectButton = actions.createEl("button", {
      text: "Reject",
      cls: "mod-warning",
    });
    rejectButton.onclick = () => {
      finish("reject");
      modal.close();
    };

    modal.onClose = () => {
      finish("reject");
    };

    modal.open();
  });
}
