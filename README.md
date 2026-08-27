# threads-mcp

An [MCP](https://modelcontextprotocol.io) server for the [Threads API](https://developers.facebook.com/docs/threads).
It does platform I/O and nothing else: publish a post, read your own posts, read their
insights, check the publishing quota. No editorial logic, no scheduling, no opinions about
what you should write.

It is the piece an agent needs in order to *reach* Threads. What to post is your problem.

```bash
npx -y @andreaselmi/threads-mcp    # needs THREADS_ACCESS_TOKEN in the environment
```

- [Quick start](#quick-start)
- [Tools](#tools)
- [Getting an access token](#getting-an-access-token)
- [Wiring it into a client](#wiring-it-into-a-client)
- [Troubleshooting](#troubleshooting)
- [What it deliberately does not do](#what-it-deliberately-does-not-do)
- [Development](#development)

## Quick start

Requires **Node 20 or newer**. You do not need to install anything: MCP clients run the server
with `npx`, which fetches it on first use.

1. Get a long-lived access token — [full walkthrough below](#getting-an-access-token). This is
   the only genuinely fiddly part, and it is Meta's fault, not this package's.
2. Export it in the shell you start your MCP client from:

   ```bash
   export THREADS_ACCESS_TOKEN="THQ..."
   ```

3. Add the server to your client's MCP config:

   ```json
   {
     "mcpServers": {
       "threads": {
         "command": "npx",
         "args": ["-y", "@andreaselmi/threads-mcp"]
       }
     }
   }
   ```

4. Restart the client and ask it who you are. It should call `threads_whoami` and answer with
   your username.

To check the server works before involving a client at all:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  | npx -y @andreaselmi/threads-mcp
```

A JSON line naming `threads-mcp` means it started and read your token. An error message on
stderr tells you what is missing.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `threads_whoami` | — | `{ id, username }` |
| `threads_publish_text` | `text` (1–500 chars), `reply_to_id` (optional) | `{ id, permalink?, text? }` |
| `threads_publish_container` | `container_id` | `{ id, permalink?, text? }` |
| `threads_list_posts` | `limit` (1–100, default 10) | array of `{ id, text?, timestamp?, permalink? }` |
| `threads_post_insights` | `post_id` | `{ views, likes, replies, reposts, quotes }` |
| `threads_publishing_limit` | — | `{ used, quota, remaining }` |

The two publish tools are marked `destructiveHint: true`; everything else is `readOnlyHint`.
Clients that ask for confirmation before destructive tools will ask before these, and should:
**a published post goes live immediately and the API cannot edit or delete it.** Removing one
means opening the Threads app.

`threads_post_insights` reads insights for *your own* posts only, and needs the
`threads_manage_insights` scope. `threads_publishing_limit` reports the rolling 24-hour quota,
which is 250 posts per account by default.

### Why `threads_publish_container` exists

Publishing on Threads is two calls: create a container, then publish it. If the second call
fails, the container still exists and stays valid for 24 hours — retrying the whole operation
would post the same text twice. When a publish fails, this server puts the container id in the
error message; pass it to `threads_publish_container` to finish the job exactly once.

The server also waits for a container to reach `FINISHED` before publishing it, polling every
2 seconds for up to a minute, so a slow container is not mistaken for a failure.

## Getting an access token

Meta's flow has four steps and no shortcut. Budget fifteen minutes the first time.

### 1. Create the app

Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) and create an app
with the **Threads** use case. The dashboard generates two sets of credentials — use the
**Threads-specific** app ID and secret, not the Facebook ones. This trips up nearly everyone.

### 2. Add scopes and a tester

Under the Threads use case, add the scopes you need:

| Scope | Needed for |
| --- | --- |
| `threads_basic` | everything — always required |
| `threads_content_publish` | `threads_publish_text`, `threads_publish_container` |
| `threads_manage_insights` | `threads_post_insights`, `threads_publishing_limit` |

Then add your Threads account as a tester, and **accept the invite from that account's
settings** (Account → Website permissions → Invites). Until the invite is accepted, every call
fails with a permissions error that never mentions the invite.

### 3. Get a short-lived token

Open the authorization window in a browser, replacing the placeholders:

```
https://threads.net/oauth/authorize
  ?client_id=YOUR_APP_ID
  &redirect_uri=YOUR_REDIRECT_URI
  &scope=threads_basic,threads_content_publish,threads_manage_insights
  &response_type=code
```

Approve, and you land on your `redirect_uri` with `?code=...` appended. The redirect URI must
match one registered in the app settings exactly. Copy the code — it is single-use and expires
in minutes — and exchange it:

```bash
curl -X POST https://graph.threads.net/oauth/access_token \
  -F client_id=YOUR_APP_ID \
  -F client_secret=YOUR_APP_SECRET \
  -F grant_type=authorization_code \
  -F redirect_uri=YOUR_REDIRECT_URI \
  -F code=THE_CODE_FROM_THE_REDIRECT
```

This returns a short-lived token, valid for **one hour**. Do not stop here.

### 4. Exchange it for a long-lived token

```bash
curl -G https://graph.threads.net/access_token \
  -d grant_type=th_exchange_token \
  -d client_secret=YOUR_APP_SECRET \
  -d access_token=THE_SHORT_LIVED_TOKEN
```

The result is valid for **60 days**. This is the value for `THREADS_ACCESS_TOKEN`.

### Keeping it alive

A long-lived token can be refreshed once it is at least 24 hours old and before it expires.
Each refresh gives another 60 days:

```bash
curl -G https://graph.threads.net/refresh_access_token \
  -d grant_type=th_refresh_token \
  -d access_token=YOUR_LONG_LIVED_TOKEN
```

A token unused for 60 days expires and cannot be refreshed — you start again from step 3. Put
a reminder in your calendar; nothing warns you.

## Wiring it into a client

### Environment variables

| Variable | Required | Default | What it is |
| --- | --- | --- | --- |
| `THREADS_ACCESS_TOKEN` | yes | — | the long-lived token from step 4 |
| `THREADS_USER_ID` | no | `me` | numeric user id, if not the token's own account |
| `THREADS_API_BASE` | no | `https://graph.threads.net/v1.0` | override, used by the tests |

The token is read from the environment at startup and never written anywhere — not to a file,
not to a log line. Prefer exporting it in your shell over writing it into a config file: config
files get committed, shell exports do not.

### Claude Code

```bash
claude mcp add threads --scope user -- npx -y @andreaselmi/threads-mcp
```

Or commit a `.mcp.json` at the root of a project, so anyone working on it gets the server:

```json
{
  "mcpServers": {
    "threads": {
      "command": "npx",
      "args": ["-y", "@andreaselmi/threads-mcp@^0.1.0"]
    }
  }
}
```

Pinning `^0.1.0` picks up fixes but not a future major version that changes the tools. Check
the connection with `/mcp`.

### Claude Desktop, Cursor, and other clients

Same shape, in that client's config file — `claude_desktop_config.json` for Claude Desktop,
`~/.cursor/mcp.json` for Cursor. Clients that do **not** inherit your shell environment need the
token passed explicitly:

```json
{
  "mcpServers": {
    "threads": {
      "command": "npx",
      "args": ["-y", "@andreaselmi/threads-mcp"],
      "env": { "THREADS_ACCESS_TOKEN": "THQ..." }
    }
  }
}
```

If you do this, that file now holds a live credential: keep it out of version control.

### Installing it instead

If you would rather not go through `npx` on every start:

```bash
npm install -g @andreaselmi/threads-mcp
```

then use `"command": "threads-mcp"` with no `args`.

## Troubleshooting

**The server will not start / the client shows `CONNECTION_CLOSED`.** The process exited at
startup, almost always because `THREADS_ACCESS_TOKEN` is not set in the environment the client
was launched from. Exporting it in a terminal does not reach an app that is already running, or
one started from the Dock. Run the server by hand to see the real message:

```bash
npx -y @andreaselmi/threads-mcp
```

It prints the reason and exits.

**`Invalid OAuth access token` or similar.** The token expired (60 days), or you are still
using the short-lived one from step 3. Redo step 4.

**A permissions error on a call that should work.** Either the scope is missing — insights and
publishing each need their own — or the tester invite was never accepted from the Threads
account's settings.

**`Post is N characters, the Threads limit is 500`.** Raised by this server before any request
is sent, so nothing was published. Split the text.

**A publish failed and you are not sure whether it went out.** Read the error: if it names a
container id, the container exists and the post did *not* go out. Call
`threads_publish_container` with that id rather than publishing again. If it does not name one,
check `threads_list_posts` before retrying.

**Quota exhausted.** `threads_publishing_limit` shows the rolling 24-hour window — 250 posts
per account. When it is spent, nothing publishes until posts age out of the window.

## What it deliberately does not do

Text posts only — no images, video, carousels, or link attachments. It reads your own posts,
not replies, mentions, or anyone else's content. It does not schedule, retry on a timer, or
keep state between calls: it holds no database and remembers nothing.

It also knows nothing about *what* you post. No themes, no tone of voice, no editorial rules
live here; that belongs to whatever is calling it. Pull requests adding product-specific
behaviour will be asked to move it to the caller.

## Development

```bash
npm install
npm test          # vitest, no network: fetch is stubbed
npm run dev       # run the server from source over stdio
npm run build     # tsc to dist/
```

Every test runs against a fake `fetch`, so the suite never touches the real API and needs no
token. Issues and pull requests:
[github.com/andreaselmi/threads-mcp](https://github.com/andreaselmi/threads-mcp).

## License

MIT
