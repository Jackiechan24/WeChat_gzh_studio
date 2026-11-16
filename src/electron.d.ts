declare module 'electron' {
  export const clipboard: { write(data: { html: string; text: string }): void } | undefined;
}
