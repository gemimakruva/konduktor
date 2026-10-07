import { Router, type Router as RouterType } from 'express';
import { ArtifactRepository } from '../db/artifact-repository.js';
import { getDb } from '../db/connection.js';

export const artifactsRouter: RouterType = Router();

artifactsRouter.get('/', (req, res) => {
  const repo = new ArtifactRepository(getDb());
  const tag = req.query.tag as string | undefined;
  res.json(repo.list(tag ? { tag } : undefined));
});

artifactsRouter.get('/:id', (req, res) => {
  const repo = new ArtifactRepository(getDb());
  const artifact = repo.getById(Number(req.params.id));
  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  res.json(artifact);
});

artifactsRouter.put('/:id', (req, res) => {
  const { tags, pinned, title, description } = req.body;
  if (tags !== undefined && !Array.isArray(tags)) {
    res.status(400).json({ error: 'tags must be an array' });
    return;
  }
  const repo = new ArtifactRepository(getDb());
  repo.update(Number(req.params.id), { tags, pinned, title, description });
  const updated = repo.getById(Number(req.params.id));
  res.json(updated);
});

artifactsRouter.delete('/:id', (req, res) => {
  const repo = new ArtifactRepository(getDb());
  repo.delete(Number(req.params.id));
  res.json({ success: true });
});
