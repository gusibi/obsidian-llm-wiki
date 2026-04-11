import { App, Modal } from "obsidian";

export interface CursorPlanTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface CursorPlanPhase {
  name: string;
  todos: CursorPlanTodo[];
}

export interface CursorCreatePlanRequest {
  name?: string;
  overview?: string;
  isProject?: boolean;
  plan: string;
  todos?: CursorPlanTodo[];
  phases?: CursorPlanPhase[];
}

export type CursorCreatePlanDecision =
  | { outcome: "accepted" }
  | { outcome: "rejected"; reason?: string }
  | { outcome: "cancelled" };

export function promptCursorPlan(
  app: App,
  request: CursorCreatePlanRequest,
): Promise<CursorCreatePlanDecision> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (decision: CursorCreatePlanDecision) => {
      if (resolved) return;
      resolved = true;
      resolve(decision);
    };

    const modal = new Modal(app);
    modal.titleEl.setText(request.name?.trim() || "Cursor plan");

    const body = modal.contentEl;
    body.addClass("cursor-plan-modal");

    if (request.overview?.trim()) {
      body.createEl("div", {
        cls: "cursor-plan-overview",
        text: request.overview.trim(),
      });
    }

    const planEl = body.createEl("pre", {
      cls: "cursor-plan-content",
    });
    planEl.textContent = request.plan;

    if (Array.isArray(request.phases) && request.phases.length > 0) {
      const phasesEl = body.createEl("div", { cls: "cursor-plan-phases" });
      phasesEl.createEl("div", {
        cls: "cursor-plan-section-title",
        text: "Phases",
      });
      for (const phase of request.phases) {
        const phaseEl = phasesEl.createEl("div", {
          cls: "cursor-plan-phase",
        });
        phaseEl.createEl("div", {
          cls: "cursor-plan-phase-name",
          text: phase.name,
        });
        const list = phaseEl.createEl("ul", {
          cls: "cursor-plan-todo-list",
        });
        for (const todo of phase.todos) {
          list.createEl("li", {
            text: `${todo.content} (${todo.status})`,
          });
        }
      }
    } else if (Array.isArray(request.todos) && request.todos.length > 0) {
      const todosEl = body.createEl("div", { cls: "cursor-plan-phases" });
      todosEl.createEl("div", {
        cls: "cursor-plan-section-title",
        text: "Todos",
      });
      const list = todosEl.createEl("ul", {
        cls: "cursor-plan-todo-list",
      });
      for (const todo of request.todos) {
        list.createEl("li", {
          text: `${todo.content} (${todo.status})`,
        });
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

    const rejectButton = actions.createEl("button", {
      text: "Reject",
      cls: "mod-warning",
    });
    rejectButton.onclick = () => {
      finish({
        outcome: "rejected",
        reason: "Rejected by user",
      });
      modal.close();
    };

    const acceptButton = actions.createEl("button", {
      text: "Accept",
      cls: "mod-cta",
    });
    acceptButton.onclick = () => {
      finish({ outcome: "accepted" });
      modal.close();
    };

    modal.onClose = () => {
      finish({ outcome: "cancelled" });
    };

    modal.open();
  });
}
