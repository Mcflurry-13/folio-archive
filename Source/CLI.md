# Folio read-only CLI

The website's task workspace exports `folio-task.json` after the user selects references and confirms a preview. The package is a local snapshot, not a live connection to IndexedDB. It contains only selected material text, optional personal notes, task constraints, confirmed/rejected directions, supported AI suggestions and missing information.

From this project directory:

```sh
node cli/folio.mjs inspect --bundle /absolute/path/folio-task.json
node cli/folio.mjs list --bundle /absolute/path/folio-task.json
node cli/folio.mjs search --bundle /absolute/path/folio-task.json --query "叙事"
node cli/folio.mjs read --bundle /absolute/path/folio-task.json --id xiaohongshu:NOTE_ID
node cli/folio.mjs context --bundle /absolute/path/folio-task.json
```

Give Claude Code or Codex the project CLI path and the approved bundle path, then ask it to run `context` and use that context to plan your case-study page. Reading a package does not authorize building, editing or publishing a website. Those actions still follow your instructions to that coding agent.

All commands output JSON. `search` is a local substring lookup within the exported selection; it is not semantic retrieval or a cloud query. `read` rejects IDs outside the package whitelist. There is no write command, network access, browser database access, automatic tool launch or MCP server. CLI schema and size checks reject malformed bundles. A user can edit their own exported file; the scope list is not a tamper-proof digital-rights system.

Downloaded copies cannot be revoked remotely. Export again to update context. Do not share a package containing private notes unless intended. No API key is required by this CLI.
