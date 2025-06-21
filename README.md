# Log Grep MCP Server

A Model Context Protocol (MCP) server that provides tools for searching and monitoring log files. This server enables Claude to grep through log files, monitor them for changes in real-time, and help with log analysis tasks.

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "log-grep": {
      "command": "node",
      "args": ["/path/to/log-grep-mcp/dist/index.js"]
    }
  }
}
```

Or if you want to run directly with tsx during development:

```json
{
  "mcpServers": {
    "log-grep": {
      "command": "npx",
      "args": ["tsx", "/path/to/log-grep-mcp/src/index.ts"]
    }
  }
}
```

## Available Tools

- `grep_log` - Search for patterns in log files
- `monitor_log` - Monitor a log file for changes
- `stop_monitor` - Stop monitoring a log file

## Usage Examples

Once configured, you can ask Claude to help with log analysis:

- "Search for error messages in /var/log/app.log"
- "Monitor my application log for new entries"
- "Find all instances of 'failed login' in the auth logs"
- "Stop monitoring the current log file"

## Development

### Prerequisites

- Node.js 18+ 
- npm

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Run in development mode:
   ```bash
   npm run dev
   ```

### Project Structure

- `src/index.ts` - Main MCP server implementation
- `dist/` - Compiled JavaScript output
- `mcp-config-example.json` - Example MCP configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.