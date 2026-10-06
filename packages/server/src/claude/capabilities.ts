import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';

interface PluginListItem {
  id: string;
  version: string;
  scope: string;
  enabled: boolean;
  installPath?: string;
}

interface McpListItem {
  name: string;
  status: 'connected' | 'failed' | 'pending';
  error?: string;
}

export class CapabilitiesManager {
  listPlugins(): PluginListItem[] {
    try {
      const output = execFileSync(CONFIG.claudeBin, ['plugin', 'list', '--json'], {
        encoding: 'utf-8', timeout: 30_000,
      });
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  installPlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'install', id], {
        encoding: 'utf-8', timeout: 120_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  uninstallPlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'uninstall', id], {
        encoding: 'utf-8', timeout: 30_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  enablePlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'enable', id], {
        encoding: 'utf-8', timeout: 10_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  disablePlugin(id: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['plugin', 'disable', id], {
        encoding: 'utf-8', timeout: 10_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  listMcp(): McpListItem[] {
    try {
      const output = execFileSync(CONFIG.claudeBin, ['mcp', 'list'], {
        encoding: 'utf-8', timeout: 60_000,
      });
      return this.parseMcpList(output);
    } catch {
      return [];
    }
  }

  private parseMcpList(output: string): McpListItem[] {
    const items: McpListItem[] = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^(.+?):\s*.+/);
      if (!match) continue;
      const name = match[1].trim();
      const isConnected = line.includes('Connected') || line.includes('✔');
      items.push({
        name,
        status: isConnected ? 'connected' : 'failed',
        error: isConnected ? undefined : line.split('-').slice(1).join('-').trim() || undefined,
      });
    }
    return items;
  }

  addMcp(name: string, command: string, args: string[]): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['mcp', 'add', name, '--', command, ...args], {
        encoding: 'utf-8', timeout: 30_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  removeMcp(name: string): { success: boolean; error?: string } {
    try {
      execFileSync(CONFIG.claudeBin, ['mcp', 'remove', name], {
        encoding: 'utf-8', timeout: 10_000,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
}
