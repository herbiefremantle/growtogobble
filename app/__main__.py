"""`python -m app` - starts the server on $HOST:$PORT (default this computer only, port 8000).

Behind Railway's proxy, proxy_headers makes the app see the real https address, so the login cookie is
marked Secure and links use https."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")),
                proxy_headers=True, forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1"))
