declare module 'pdf-parse' {
  export default function pdf(buffer: Buffer): Promise<{ text: string; numpages: number; numrender: number; info: unknown; metadata: unknown; version: string }>
}
