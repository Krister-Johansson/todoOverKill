# MCP server

The app serves its tools over the Model Context Protocol at `/api/mcp`, so an MCP client such as Claude Code can read your projects and tasks. With `pnpm dev` running, the endpoint is `http://localhost:5173/api/mcp`, or the port in `$PORT`.

The server uses the Streamable HTTP transport and is stateless. Every POST gets a new server, the response is plain JSON, and no session id is issued; the server and transport are closed once the response is ready. A GET or DELETE gets a 405 with a JSON-RPC error, because there is no event stream to open and no session to end.

There is no authentication, like the rest of the app. The server answers only requests whose `Host` header names `localhost`, `127.0.0.1` or `[::1]`, on any port, and refuses any other host with a 403 and a JSON-RPC error. That stops a web page that points its own domain at 127.0.0.1 (DNS rebinding) from reading your data through the browser. Anything else on your machine that can reach the port can still read it.

## Tools

The server registers the read tools from `src/tools/server.ts` (`readServerTools`). The tools that create, change, archive or delete arrive over MCP with F36, which makes the destructive ones ask for `confirm: true`.

| Tool            | Returns                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `list_projects` | `{ projects }`, unarchived projects sorted by name; `includeArchived: true` adds the rest |
| `get_project`   | One project with its statuses in board order                                              |
| `list_tasks`    | `{ tasks }` for one project in board order, with the filters `listTasks` takes            |
| `get_task`      | One task with its status, labels and due date                                             |
| `search`        | `{ tasks }` matching a query by title, description or reference such as `SITE-12`         |

Each result comes twice: as `structuredContent`, which matches the tool's output schema, and as the same JSON in a text content item for clients that read only text. Timestamps are ISO strings and due dates are `YYYY-MM-DD`.

Every tool is registered with the annotations `readOnlyHint: true` and `openWorldHint: false`, so a client knows it changes nothing and talks to nothing outside the app. A call may leave out `arguments`; the server reads that as `{}`.

A failed call is a result with `isError: true` and one text item, not a JSON-RPC error. For an unknown id the text is the code and message, such as `not_found: No project with id p1.`. An unexpected server error, such as a database failure, is logged on the server and reads `internal: Something went wrong on the server.`, without its own message. An argument the tool does not take, or one of the wrong type, fails the SDK's input check, and the text reads `MCP error -32602: Input validation error: ...` followed by the Zod issues, which name the argument.

## Add it to Claude Code

Start the app with `pnpm dev`, then run:

```bash
claude mcp add --transport http todo-over-kill http://localhost:5173/api/mcp
```

That adds the server for you in this directory. Add `--scope project` to write it to `.mcp.json` instead, so everyone who opens the repository gets it. The entry looks like this, and you can also write it by hand:

```json
{
  "mcpServers": {
    "todo-over-kill": {
      "type": "http",
      "url": "http://localhost:5173/api/mcp"
    }
  }
}
```

In Claude Code, `/mcp` shows whether the server is connected. Then ask something like:

> Which tasks in the Website project are high priority, and what is the status of SITE-3?

Claude Code calls `list_projects` to find the project id, then `list_tasks` with `priority: "high"` and `search` for `SITE-3`.

## Try it with the MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector, choose the Streamable HTTP transport, enter `http://localhost:5173/api/mcp`, and connect. The Tools tab lists the five tools and runs them with the arguments you enter.

## Tests

`src/routes/api/mcp.test.ts` connects the SDK client to the route's handlers through the client's `fetch` option, because Vitest cannot boot Start's fetch handler. `tests/e2e/mcp.spec.ts` connects it to the preview server, which proves the route is in the route tree.
