import { Modal, Notice, Setting, TextAreaComponent } from 'obsidian';

export class ClaudeChatModal extends Modal {
  private claudeConnection: any;
  private chatHistory!: HTMLElement;
  private inputArea!: TextAreaComponent;
  private sendButton!: HTMLButtonElement;

  constructor(app: any, claudeConnection: any) {
    super(app);
    this.claudeConnection = claudeConnection;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Claude Chat' });
    this.createChatInterface(contentEl);
  }

  private createChatInterface(container: HTMLElement) {
    container.createEl('div', { cls: 'claude-chat-container' }, (container) => {
      this.chatHistory = container.createEl('div', { cls: 'claude-chat-history' });
      
      const inputContainer = container.createEl('div', { cls: 'claude-chat-input-container' });
      
      this.inputArea = new TextAreaComponent(inputContainer);
      this.inputArea.inputEl.placeholder = 'Type your message here...';
      this.inputArea.inputEl.rows = 3;
      
      const buttonContainer = inputContainer.createEl('div', { cls: 'claude-chat-button-container' });
      
      this.sendButton = buttonContainer.createEl('button', { 
        text: 'Send',
        cls: 'mod-cta'
      });
      
      this.sendButton.onclick = () => this.sendMessage();
      
      this.inputArea.inputEl.onkeydown = (event: any) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.sendMessage();
        }
      };
    });

    this.addChatMessage('Claude', 'Hello! I\'m ready to help you with your Obsidian vault. What would you like to do?', 'assistant');
  }

  private async sendMessage() {
    const message = this.inputArea.getValue().trim();
    if (!message) return;

    this.addChatMessage('You', message, 'user');
    this.inputArea.setValue('');
    this.sendButton.disabled = true;
    this.sendButton.textContent = 'Sending...';

    try {
      this.addChatMessage('Claude', 'Message received! This is a Phase 1 demo.', 'assistant');
    } catch (error: any) {
      this.addChatMessage('Claude', `Error: ${error.message}`, 'error');
    } finally {
      this.sendButton.disabled = false;
      this.sendButton.textContent = 'Send';
    }
  }

  private addChatMessage(sender: string, content: string, type: 'user' | 'assistant' | 'error') {
    const messageEl = this.chatHistory.createEl('div', { cls: `claude-chat-message claude-chat-${type}` });
    
    messageEl.createEl('strong', { text: `${sender}: ` });
    messageEl.createEl('p', { text: content });
    
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}