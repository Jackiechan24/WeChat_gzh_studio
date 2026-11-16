// Detached article nodes belong to the document that will display them, including pop-outs.
export function createDetachedElement<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K): HTMLElementTagNameMap[K] {
  const fragment = document.adoptNode(createFragment());
  return fragment.removeChild(fragment.createEl(tag));
}
