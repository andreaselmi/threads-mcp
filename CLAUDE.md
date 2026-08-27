# threads-mcp

An MCP server for the Threads API, published as `@andreaselmi/threads-mcp`. It does platform
I/O and nothing else. Source: https://github.com/andreaselmi/threads-mcp

## The boundary

Nothing product-specific enters this repo — no themes, no tone of voice, no editorial rules,
no product names, not even inside a comment or an example. This package is used by projects
that know what to post; it only knows how to post. If a change would make the server useful
only to one caller, it belongs in that caller, not here.

Credentials live only in the environment (`THREADS_ACCESS_TOKEN`). Never in a file, never in a
log line, never in a test fixture that looks real. The test suite runs against a stubbed
`fetch` and must keep working with no token set.

Publishing is irreversible: a post goes live immediately and cannot be edited. Publish tools
are marked `destructiveHint: true` and any new one must be too.

## Commands

```bash
npm test          # vitest, no network
npm run build     # tsc to dist/
npm run dev       # run from source over stdio
```

Manual smoke test of the built server:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  | THREADS_ACCESS_TOKEN=fake node dist/index.js
```

## Shipping a change

Consumers get this package from npm, so a change that is committed but not published does not
exist for them. The full cycle:

1. Change the code and its tests. `npm test` stays green.
2. Commit and push to `main`.
3. `npm version patch` (or `minor` — see below). This bumps `package.json`, commits, and tags.
4. `npm publish` **from a real terminal**, not from an agent session: npm requires two-factor
   confirmation and the prompt needs a TTY. `prepublishOnly` rebuilds and reruns the tests, so
   a broken package cannot go out.
5. `git push --follow-tags`, so the tag on GitHub matches the version on npm.

`patch` for a fix, `minor` for a new tool or a new optional argument, `major` for anything that
changes or removes an existing tool's name, arguments or return shape. Callers pin `^0.1.0`, so
a `minor` reaches them on their next restart and a `major` does not — which is the point.

Do not publish from here without being asked: it is public and cannot be undone.
