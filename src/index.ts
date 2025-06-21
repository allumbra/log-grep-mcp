#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import { watch } from 'chokidar';
import { EventEmitter } from 'events';

interface GrepOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  lineNumbers?: boolean;
  context?: number;
}

class LogGrepServer {
  private server: Server;
  private watchers: Map<string, any> = new Map();
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    this.server = new Server(
      {
        name: 'log-grep-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'grep_log',
          description: 'Search for patterns in a log file',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the log file',
              },
              pattern: {
                type: 'string',
                description: 'Pattern to search for',
              },
              options: {
                type: 'object',
                properties: {
                  caseSensitive: {
                    type: 'boolean',
                    description: 'Case sensitive search (default: false)',
                  },
                  regex: {
                    type: 'boolean',
                    description: 'Use regex pattern (default: false)',
                  },
                  lineNumbers: {
                    type: 'boolean',
                    description: 'Include line numbers (default: true)',
                  },
                  context: {
                    type: 'number',
                    description: 'Number of context lines before/after match',
                  },
                },
              },
            },
            required: ['filePath', 'pattern'],
          },
        },
        {
          name: 'monitor_log',
          description: 'Start monitoring a log file for changes',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the log file to monitor',
              },
              pattern: {
                type: 'string',
                description: 'Pattern to watch for (optional)',
              },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'stop_monitor',
          description: 'Stop monitoring a log file',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the log file to stop monitoring',
              },
            },
            required: ['filePath'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'grep_log':
          return await this.grepLog(request.params.arguments);
        case 'monitor_log':
          return await this.monitorLog(request.params.arguments);
        case 'stop_monitor':
          return await this.stopMonitor(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async grepLog(args: any) {
    const { filePath, pattern, options = {} } = args;
    const {
      caseSensitive = false,
      regex = false,
      lineNumbers = true,
      context = 0,
    } = options as GrepOptions;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const matches: string[] = [];

      const searchPattern = regex
        ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
        : pattern;

      lines.forEach((line, index) => {
        let isMatch = false;

        if (regex) {
          isMatch = searchPattern.test(line);
        } else {
          isMatch = caseSensitive
            ? line.includes(pattern)
            : line.toLowerCase().includes(pattern.toLowerCase());
        }

        if (isMatch) {
          const result: string[] = [];

          // Add context lines before
          for (let i = Math.max(0, index - context); i < index; i++) {
            result.push(
              lineNumbers ? `${i + 1}: ${lines[i]}` : lines[i]
            );
          }

          // Add the matching line
          result.push(
            lineNumbers ? `${index + 1}: ${line}` : line
          );

          // Add context lines after
          for (
            let i = index + 1;
            i < Math.min(lines.length, index + context + 1);
            i++
          ) {
            result.push(
              lineNumbers ? `${i + 1}: ${lines[i]}` : lines[i]
            );
          }

          matches.push(result.join('\n'));
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: matches.length > 0
              ? matches.join('\n---\n')
              : 'No matches found',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async monitorLog(args: any) {
    const { filePath, pattern } = args;

    if (this.watchers.has(filePath)) {
      return {
        content: [
          {
            type: 'text',
            text: `Already monitoring: ${filePath}`,
          },
        ],
      };
    }

    try {
      const watcher = watch(filePath, {
        persistent: true,
        usePolling: true,
        interval: 100,
      });

      let lastSize = 0;
      try {
        const stats = await fs.stat(filePath);
        lastSize = stats.size;
      } catch (error) {
        // File might not exist yet
      }

      watcher.on('change', async () => {
        try {
          const stats = await fs.stat(filePath);
          if (stats.size > lastSize) {
            const content = await fs.readFile(filePath, 'utf-8');
            const newContent = content.slice(lastSize);
            lastSize = stats.size;

            if (pattern) {
              const lines = newContent.split('\n');
              const matches = lines.filter((line) =>
                line.toLowerCase().includes(pattern.toLowerCase())
              );
              if (matches.length > 0) {
                this.eventEmitter.emit('match', {
                  filePath,
                  matches,
                  pattern,
                });
              }
            } else {
              this.eventEmitter.emit('change', {
                filePath,
                newContent,
              });
            }
          }
        } catch (error) {
          console.error(`Error monitoring file: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      this.watchers.set(filePath, watcher);

      return {
        content: [
          {
            type: 'text',
            text: `Started monitoring: ${filePath}${
              pattern ? ` for pattern "${pattern}"` : ''
            }`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error starting monitor: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async stopMonitor(args: any) {
    const { filePath } = args;

    if (!this.watchers.has(filePath)) {
      return {
        content: [
          {
            type: 'text',
            text: `Not monitoring: ${filePath}`,
          },
        ],
      };
    }

    const watcher = this.watchers.get(filePath);
    await watcher.close();
    this.watchers.delete(filePath);

    return {
      content: [
        {
          type: 'text',
          text: `Stopped monitoring: ${filePath}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Log Grep MCP server running on stdio');
  }
}

const server = new LogGrepServer();
server.run().catch(console.error);