export interface Artifact {
  id: number;
  sessionId: string | null;
  url: string | null;
  title: string;
  description: string;
  icon: string;
  artifactType: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
}
