# ai-eng-training

AI Engineering Training

## Routes

| Route         | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `/`           | Home page                                           |
| `/api/status` | Liveness check — is the backend up and which build? |

```bash
curl -s http://localhost:3000/api/status
# {"status":"ok","environment":"development","uptimeSeconds":1,"timestamp":"..."}
```

`force-dynamic` + `Cache-Control: no-store`, so it is never prerendered or
cached — a cached health check reports stale liveness.
