# MCP Server Configuration

This document explains how to configure MCP (Model Context Protocol) servers in Cursor.

## Current MCP Servers

### 1. Vercel MCP
- **URL**: `https://mcp.vercel.com`
- **Purpose**: Deploy and manage Vercel projects directly from Cursor

### 2. Supabase MCP (RLM Admin)
- **URL**: `https://mcp.supabase.com`
- **Purpose**: Manage Supabase database, migrations, and edge functions

## How to Add MCP Servers in Cursor

### Method 1: Via Cursor Settings UI

1. Open Cursor Settings:
   - Press `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac)
   - Or go to **File → Preferences → Settings**

2. Search for "MCP" or "Model Context Protocol"

3. Find the **MCP Servers** configuration section

4. Click **Edit in settings.json** or add the configuration manually

5. Add the following JSON to your Cursor settings:

```json
{
  "mcpServers": {
    "vercel": {
      "url": "https://mcp.vercel.com"
    },
    "rlm_admin": {
      "url": "https://mcp.supabase.com"
    }
  }
}
```

### Method 2: Direct Settings File Edit

1. Open Cursor's settings file:
   - **Windows**: `%APPDATA%\Cursor\User\settings.json`
   - **Mac**: `~/Library/Application Support/Cursor/User/settings.json`
   - **Linux**: `~/.config/Cursor/User/settings.json`

2. Add or merge the `mcpServers` configuration:

```json
{
  "mcpServers": {
    "vercel": {
      "url": "https://mcp.vercel.com"
    },
    "rlm_admin": {
      "url": "https://mcp.supabase.com"
    }
  }
}
```

3. Save the file and restart Cursor

## Verification

After adding the MCP servers:

1. Restart Cursor completely
2. Check the MCP status in Cursor's status bar or settings
3. You should see Vercel and Supabase MCP tools available in the AI assistant

## Reference

- See `.cursor/mcp-config.json` for the complete configuration reference
- MCP Documentation: https://modelcontextprotocol.io
