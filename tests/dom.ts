import { JSDOM } from 'jsdom';

export function createTestDocument(): Document {
  const { window } = new JSDOM();
  const document = window.document as unknown as Document;
  // Emulate the Obsidian helper used for detached article nodes.
  Object.defineProperty(window.DocumentFragment.prototype, 'createEl', {
    value<K extends keyof HTMLElementTagNameMap>(this: DocumentFragment, tag: K): HTMLElementTagNameMap[K] {
      return this.appendChild(this.ownerDocument.createElement(tag));
    }
  });
  return document;
}
