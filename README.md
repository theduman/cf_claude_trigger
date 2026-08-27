# cf-claude-trigger

Align Claude's 5-hour usage windows with your working day.

A usage window opens on your first message and runs for 5 hours from that moment. If you
start at 09:40, the window closes at 14:40 and the next one carries you to 19:40 — the
boundaries land wherever the day happened to begin, and the tail of the last window is
spent asleep.

This Worker sends one throwaway message on a cron at a time you want, so the
window opens on a boundary you chose. Three pings spaced 5h02m apart cover a continuous
15-hour stretch, each firing just after the previous window closes.

The ping itself is one word to `claude-haiku-4-5`, the lightest draw on your quota — the
reply is checked for `pong` only to confirm the window actually opened. Set your own
times in `wrangler.jsonc`; see [Schedule](#schedule).

**Auth must be a subscription token, not an API key.** A `sk-ant-api03-...` key bills the
Console workspace pay-as-you-go and opens no window at all. `claude setup-token` (Pro/Max
only) mints a long-lived `sk-ant-oat01-...` token that authenticates as your subscription
— that is the credential the window belongs to.

## Deploy

```bash
npx wrangler login
claude setup-token                             # prints an sk-ant-oat01-... token
npx wrangler secret put CLAUDE_CODE_OAUTH_TOKEN
npx wrangler secret put TRIGGER_SECRET         # any long random string
npx wrangler deploy
```

## Schedule

Set your own times — the crons in `wrangler.jsonc` are an example, not a default worth
keeping. 02:00 UTC is the middle of the night in the Americas and mid-morning in Asia.

**Cloudflare cron triggers always run in UTC.** There is no timezone option, so you
convert once and write the UTC result into `wrangler.jsonc`.

### Picking your times

Each ping opens a 5-hour window. Three pings spaced 5h02m apart cover a continuous
15-hour stretch; the 2-minute gap makes each one land just after the previous window
closes.

1. Pick the local time you want the first window to open — usually when you start work.
2. Subtract your UTC offset to get UTC. Add 24h and wrap to the previous day if it goes
   negative.
3. Add 5h02m twice for the second and third pings.
4. Write each as `"MINUTE HOUR * * *"` in `triggers.crons`, then `npx wrangler deploy`.

Worked example — first window at 09:00 local in UTC−5:

| | Local | UTC | Cron |
|---|---|---|---|
| 1 | 09:00 | 14:00 | `0 14 * * *` |
| 2 | 14:02 | 19:02 | `2 19 * * *` |
| 3 | 19:04 | 00:04 (next day) | `4 0 * * *` |

Fewer or more than three is fine — `crons` takes any list. Cloudflare caps Cron Triggers
per *account* (not per Worker): 5 on the Free plan, 250 on Paid.

**Daylight saving:** UTC does not observe it, so a fixed cron shifts an hour relative to
your local clock twice a year. Edit and redeploy when your offset changes.

## Manual trigger

```bash
curl "https://cf-claude-trigger.<subdomain>.workers.dev/ping?secret=$TRIGGER_SECRET"
```

Returns `200` with `{"ok":true,"reply":"pong",...}` — or `502` if the model replied
something other than pong.

## Local run

```bash
cp .dev.vars.example .dev.vars   # fill in real values
npx wrangler dev
curl "http://localhost:8787/ping?secret=..."
# fire the cron handler:
curl "http://localhost:8787/__scheduled?cron=0+6+*+*+*"
```

## Notes

- Auth is a Claude Code OAuth token from `claude setup-token`, sent as
  `Authorization: Bearer` with the `anthropic-beta: oauth-2025-04-20` header. It is tied
  to the subscription of whoever ran the command, and is long-lived — rotate it by
  re-running `claude setup-token` and `npx wrangler secret put CLAUDE_CODE_OAUTH_TOKEN`.
- Logs land in `wrangler tail` and the Workers dashboard (observability is on).

## License

MIT — see [LICENSE](LICENSE).
