import { Router, type Router as RouterType } from 'express';
import { CapabilitiesManager } from '../claude/capabilities.js';

export const capabilitiesRouter: RouterType = Router();
const mgr = new CapabilitiesManager();

capabilitiesRouter.get('/plugins', (_req, res) => {
  res.json(mgr.listPlugins());
});

capabilitiesRouter.post('/plugins/install', (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== 'string') { res.status(400).json({ error: 'id required' }); return; }
  res.json(mgr.installPlugin(id));
});

capabilitiesRouter.post('/plugins/:id/uninstall', (req, res) => {
  res.json(mgr.uninstallPlugin(req.params.id));
});

capabilitiesRouter.post('/plugins/:id/enable', (req, res) => {
  res.json(mgr.enablePlugin(req.params.id));
});

capabilitiesRouter.post('/plugins/:id/disable', (req, res) => {
  res.json(mgr.disablePlugin(req.params.id));
});

capabilitiesRouter.get('/mcp', (_req, res) => {
  res.json(mgr.listMcp());
});

capabilitiesRouter.post('/mcp/add', (req, res) => {
  const { name, command, args } = req.body;
  if (!name || !command) { res.status(400).json({ error: 'name and command required' }); return; }
  res.json(mgr.addMcp(name, command, args || []));
});

capabilitiesRouter.delete('/mcp/:name', (req, res) => {
  res.json(mgr.removeMcp(req.params.name));
});
