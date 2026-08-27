# threads-mcp

An [MCP](https://modelcontextprotocol.io) server for the [Threads API](https://developers.facebook.com/docs/threads).
It does platform I/O and nothing else: publish a post, read your own posts, read their
insights, check the publishing quota. No editorial logic, no scheduling, no opinions about
what you should write.

It is the piece an agent needs in order to *reach* Threads. What to post is your problem.

## Tools

| Tool | What it does |
| --- | --- |
| `threads_whoami` | Id and username of the connected account |
| `threads_publish_text` | Publish a text post (max 500 chars), optionally as a reply |
| `threads_publish_container` | Publish a container that was created but never published |
| `threads_list_posts` | Read your most recent posts |
| `threads_post_insights` | Views, likes, replies, reposts and quotes for one of your posts |
| `threads_publishing_limit` | How much of the rolling 24h publishing quota is left |

The two publish tools are marked `destructiveHint: true`: a post goes live immediately and
cannot be edited. Everything else is read-only.

### Why `threads_publish_container` exists

Publishing on Threads is two calls: create a container, then publish it. If the second call
fails, the container still exists and stays valid for 24 hours — retrying the whole operation
would post the same text twice. When a publish fails, the error carries the container id;
pass it to `threads_publish_container` to finish the job exactly once.

The server also waits for a container to reach `FINISHED` before publishing it, polling for up
to a minute, so a slow container is not mistaken for a failure.

## Install

Requires Node 20 or newer.

```bash
npm install -g @andreaselmi/threads-mcp
```

Or skip the install and let your client fetch it on demand — see below.

## Configuration

| Variable | Required | Default | What it is |
| --- | --- | --- | --- |
| `THREADS_ACCESS_TOKEN` | yes | — | a long-lived Threads access token |
| `THREADS_USER_ID` | no | `me` | numeric user id, if you don't want the token's own account |
| `THREADS_API_BASE` | no | `https://graph.threads.net/v1.0` | override, used by the tests |

The token is read from the environment and never written anywhere. Keep it out of your
config files and out of version control.

### Getting a token

1. Create an app at [developers.facebook.com](https://developers.facebook.com/apps) and add
   the **Threads API** use case.
2. Add the scopes you need: `threads_basic` for reading, `threads_content_publish` for
   publishing, `threads_manage_insights` for metrics.
3. Add your Threads account as a tester and accept the invite from the account's settings.
4. Generate a short-lived token, then exchange it for a long-lived one (60 days) with the
   `access_token` endpoint. Long-lived tokens can be refreshed before they expire.

### Wiring it into a client

```json
{
  "mcpServers": {
    "threads": {
      "command": "npx",
      "args": ["-y", "@andreaselmi/threads-mcp"],
      "env": { "THREADS_ACCESS_TOKEN": "${THREADS_ACCESS_TOKEN}" }
    }
  }
}
```

If your client inherits the shell environment, drop the `env` block and export the token in
your shell instead — one less place for it to leak.

## Development

```bash
npm install
npm test          # vitest, no network: fetch is stubbed
npm run dev       # run the server from source over stdio
npm run build     # tsc to dist/
```

Every test runs against a fake `fetch`, so the suite never touches the real API and needs no
token.

## License

MIT
