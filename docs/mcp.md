# MCP server

The app serves its tools over the Model Context Protocol at `/api/mcp`, so an MCP client such as Claude Code can read and change your projects, tasks, subtasks, labels and comments. With `pnpm dev` running, the endpoint is `http://localhost:5173/api/mcp`, or the port in `$PORT`.

The server uses the Streamable HTTP transport and is stateless. Every POST gets a new server, the response is plain JSON, and no session id is issued; the server and transport are closed once the response is ready. A GET or DELETE gets a 405 with a JSON-RPC error, because there is no event stream to open and no session to end.

There is no authentication, like the rest of the app. The server answers only requests whose `Host` header names `localhost`, `127.0.0.1` or `[::1]`, on any port, and refuses any other host with a 403 and a JSON-RPC error. That stops a web page that points its own domain at 127.0.0.1 (DNS rebinding) from reading your data through the browser. Anything else on your machine that can reach the port can still read it.

## Tools

The server registers every tool in `serverTools` from `src/tools/server.ts`, the same list the assistant takes. The `confirm` argument described below exists only on this transport: the assistant asks the user with its own Approve and Deny prompt (F40) instead.

These tools read:

| Tool            | Returns                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `list_projects` | `{ projects }`, unarchived projects sorted by name; `includeArchived: true` adds the rest |
| `get_project`   | One project with its statuses in board order                                              |
| `list_tasks`    | `{ tasks }` for one project in board order, with the filters `listTasks` takes            |
| `get_task`      | One task with its status, labels and due date                                             |
| `search`        | `{ tasks }` matching a query by title, description or reference such as `SITE-12`         |
| `list_subtasks` | `{ subtasks }` for one task, top to bottom, each with its title and done state            |
| `list_labels`   | `{ labels }` for one project, sorted by name, each with its name and colour               |
| `list_comments` | `{ comments }` for one task, oldest first, each with its body and timestamps              |

These tools create, change, archive or delete. The four marked with confirm need `confirm: true`:

| Tool              | Returns                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| `create_project`  | The new project with its default statuses                                     |
| `archive_project` | The project with its statuses and `archivedAt` set (confirm)                  |
| `create_task`     | The new task with its status and labels                                       |
| `update_task`     | The task after the change                                                     |
| `move_task`       | The task in its new status or place; a move into Done sets `completedAt`      |
| `complete_task`   | The task with `completedAt` set, in a done-category status                    |
| `delete_task`     | The task as it was, after it and its subtasks and comments are gone (confirm) |
| `add_subtask`     | The new subtask, at the end of the task's list                                |
| `update_subtask`  | The subtask after the change                                                  |
| `move_subtask`    | The subtask in its new place                                                  |
| `delete_subtask`  | The subtask as it was (confirm)                                               |
| `create_label`    | The new label                                                                 |
| `add_comment`     | The new comment                                                               |
| `update_comment`  | The comment with its new body                                                 |
| `delete_comment`  | The comment as it was (confirm)                                               |

Each result comes twice: as `structuredContent`, which matches the tool's output schema, and as the same JSON in a text content item for clients that read only text. Timestamps are ISO strings and due dates are `YYYY-MM-DD`.

The read tools carry the annotations `readOnlyHint: true` and `openWorldHint: false`, so a client knows they change nothing and talk to nothing outside the app. The write tools carry `readOnlyHint: false` and `openWorldHint: false`. The ones that only add a row, `create_project`, `create_task`, `add_subtask`, `create_label` and `add_comment`, carry `destructiveHint: false`. Every other write tool overwrites, clears, moves or removes data and carries `destructiveHint: true`: the `update_*` and `move_*` tools, `complete_task`, `archive_project` and the `delete_*` tools. `destructiveHint` does not decide which tools need `confirm`; only the four below do. A call may leave out `arguments`; the server reads that as `{}`.

### Confirmation

`archive_project`, `delete_task`, `delete_subtask` and `delete_comment` take an optional boolean `confirm`, described as "Set to true only after the user has approved this call." The model should ask you first, then call the tool again with it. Without `confirm: true`, whether it is missing or `false`, the call changes nothing and returns an error result whose text reads:

```text
confirmation_required: delete_task needs the user's approval. Ask the user, then call it again with confirm: true.
```

with the tool's own name in place of `delete_task`. The server cannot check that you approved: `confirm` is set by the client, so a careless or misled model can send `confirm: true` on its first call. The rule holds only as long as the client obeys it; a client that asks your permission before each MCP tool call, as Claude Code does, adds the check the server cannot make. `confirmation_required` is a `ToolError` code from `src/tools/errors.ts`, next to `not_found`, `conflict`, `validation` and `internal`. A `confirm` that is not a boolean, such as `"yes"`, fails the SDK's input check like any other wrong type. The server drops `confirm` before it calls the tool, so the tool's own input schema stays strict. No other tool takes `confirm`.

### Errors

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

Claude Code calls `list_projects` to find the project id, then `list_tasks` with `priority: "high"` and `search` for `SITE-3`. Ask it to delete a task and it should ask you first, then call `delete_task` with `confirm: true`. Claude Code also asks your permission before it runs any MCP tool, unless you have allowed it.

## Try it with the MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector, choose the Streamable HTTP transport, enter `http://localhost:5173/api/mcp`, and connect. The Tools tab lists the 23 tools and runs them with the arguments you enter.

## Tests

`src/routes/api/mcp.test.ts` connects the SDK client to the route's handlers through the client's `fetch` option, because Vitest cannot boot Start's fetch handler. `tests/e2e/mcp.spec.ts` connects it to the preview server, which proves the route is in the route tree.
