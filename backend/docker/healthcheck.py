import urllib.request

request = urllib.request.Request("http://127.0.0.1:8000/healthz/", headers={"Host": "backend"})
with urllib.request.urlopen(request, timeout=5) as response:
    if response.status != 200:
        raise SystemExit(1)
