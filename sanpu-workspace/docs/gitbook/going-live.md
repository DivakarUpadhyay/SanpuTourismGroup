# Going live for a presentation

The Vercel sites (https://sanpu-travel.vercel.app, https://sanpu-trip-copilot.vercel.app) use the real APIs on this computer through Cloudflare quick tunnels.

```powershell
cd D:\Divakar-Apps\SanpuTourismGroup\sanpu-workspace
./scripts/go-live.ps1            # about 3–5 minutes: APIs, tunnels, Vercel redeploy, check
./scripts/go-live.ps1 -ApisOnly  # after a code change: restart the APIs only
./scripts/go-live.ps1 -Off       # afterwards: offline preview (computer can be turned off)
```

- Keep the computer on and awake while live.
- If the computer sleeps or the tunnel stops, the sites switch to the offline preview by themselves (pages still open; saving waits for live mode) and switch back when the API answers again.
- Tunnel addresses change on every start, so run `go-live.ps1` again after a restart.
