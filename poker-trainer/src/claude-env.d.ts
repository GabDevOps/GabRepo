// Minimal typing of the claude.ai Artifact runtime (window.claude.use). Absent outside claude.ai.
type SampleInput = string | { role: 'user' | 'assistant'; content: string }[];
type SampleOptions = {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  modelTier?: 'quick' | 'default' | 'complex';
  cache?: boolean;
};
interface SampleFn {
  (input: SampleInput, options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: SampleInput, options?: SampleOptions): Promise<T>;
}
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CollRef {
  doc(id: string): DocRef;
  get(): Promise<{ docs: DocSnap[] }>;
}
interface ClaudeDb {
  collection(path: string): CollRef;
}
interface ClaudeUser {
  id(): Promise<string | null>;
}
interface ClaudeDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
interface Window {
  claude?: {
    use(name: 'sample'): Promise<SampleFn | null>;
    use(name: 'db'): Promise<ClaudeDb | null>;
    use(name: 'user'): Promise<ClaudeUser | null>;
    use(name: 'downloads'): Promise<ClaudeDownloads | null>;
  };
}
