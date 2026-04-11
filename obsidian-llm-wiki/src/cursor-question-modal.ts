import { App, Modal } from "obsidian";

export interface CursorQuestionOption {
  id: string;
  label: string;
}

export interface CursorQuestionPrompt {
  id: string;
  prompt: string;
  options: CursorQuestionOption[];
  allowMultiple?: boolean;
}

export type CursorAskQuestionDecision =
  | {
      outcome: "answered";
      answers: { questionId: string; selectedOptionIds: string[] }[];
    }
  | { outcome: "skipped"; reason?: string }
  | { outcome: "cancelled" };

export interface CursorAskQuestionRequest {
  title?: string;
  questions: CursorQuestionPrompt[];
}

export function promptCursorQuestions(
  app: App,
  request: CursorAskQuestionRequest,
): Promise<CursorAskQuestionDecision> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (decision: CursorAskQuestionDecision) => {
      if (resolved) return;
      resolved = true;
      resolve(decision);
    };

    const modal = new Modal(app);
    modal.titleEl.setText(request.title?.trim() || "Cursor question");

    const body = modal.contentEl;
    body.addClass("cursor-question-modal");

    const selections = new Map<string, Set<string>>();
    let canSubmit = false;

    const updateSubmitState = () => {
      canSubmit = request.questions.every((question) => {
        const selected = selections.get(question.id);
        return !!selected && selected.size > 0;
      });
      submitButton.toggleClass("mod-disabled", !canSubmit);
      submitButton.disabled = !canSubmit;
    };

    for (const question of request.questions) {
      const section = body.createEl("div", { cls: "cursor-question-section" });
      section.createEl("div", {
        cls: "cursor-question-prompt",
        text: question.prompt,
      });

      const optionsEl = section.createEl("div", {
        cls: "cursor-question-options",
      });

      for (const option of question.options) {
        const optionLabel = optionsEl.createEl("label", {
          cls: "cursor-question-option",
        });
        const input = optionLabel.createEl("input", {
          attr: {
            type: question.allowMultiple ? "checkbox" : "radio",
            name: `cursor-question-${question.id}`,
            value: option.id,
          },
        });
        optionLabel.createEl("span", {
          text: option.label,
        });

        input.addEventListener("change", () => {
          if (question.allowMultiple) {
            const selected =
              selections.get(question.id) ?? new Set<string>();
            if (input.checked) {
              selected.add(option.id);
            } else {
              selected.delete(option.id);
            }
            selections.set(question.id, selected);
          } else if (input.checked) {
            selections.set(question.id, new Set([option.id]));
          }
          updateSubmitState();
        });
      }
    }

    const actions = body.createEl("div", { cls: "cursor-question-actions" });

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

    const submitButton = actions.createEl("button", {
      text: "Submit",
      cls: "mod-cta",
    });
    submitButton.onclick = () => {
      if (!canSubmit) {
        return;
      }
      finish({
        outcome: "answered",
        answers: request.questions.map((question) => ({
          questionId: question.id,
          selectedOptionIds: Array.from(
            selections.get(question.id) ?? new Set<string>(),
          ),
        })),
      });
      modal.close();
    };

    updateSubmitState();

    modal.onClose = () => {
      finish({ outcome: "cancelled" });
    };

    modal.open();
  });
}
