import type { StreamEvent } from '@konduktor/shared';

export interface ArtifactInput {
  title: string;
  description: string;
  icon: string;
  artifactType: string;
  url: string | null;
  filePath: string | null;
}

export function extractArtifactFromEvent(event: StreamEvent): ArtifactInput[] {
  if (event.type !== 'assistant' || !event.content) return [];

  const artifacts: ArtifactInput[] = [];
  for (const block of event.content) {
    if (block.type === 'tool_use' && block.name === 'Artifact' && block.input) {
      artifacts.push({
        title: (block.input.title as string) || 'Untitled',
        description: (block.input.description as string) || '',
        icon: (block.input.icon as string) || 'code',
        artifactType: 'html',
        url: (block.input.url as string) || null,
        filePath: (block.input.file_path as string) || null,
      });
    }
  }
  return artifacts;
}
