// Detached article nodes belong to the document that will display them, including pop-outs.
export function createDetachedElement<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K): HTMLElementTagNameMap[K] {
  const fragment = document.adoptNode(createFragment());
  return fragment.removeChild(fragment.createEl(tag));
}

// Obsidian displays aria-label as a tooltip. Refer to a text node for the name.
export function setControlName(element: HTMLElement, text: string): void {
  const label = element.createSpan({ cls: 'wx-control-label', text });
  label.id = `wx-name-${Math.random().toString(36).slice(2)}`;
  element.setAttribute('aria-labelledby', label.id);
}
