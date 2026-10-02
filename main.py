from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Live Protocol Visualizer")
app.mount("/static", StaticFiles(directory="static"), name="static")

class Activity(BaseModel):
    mode: str
    url: str | None = None
    to: str | None = None
    subject: str | None = None
    body: str | None = None
    quality: str | None = None
    action: str | None = None

@app.get("/", response_class=HTMLResponse)
async def index():
    return open("static/index.html", encoding="utf-8").read()

@app.post("/api/activity")
async def activity(a: Activity):
    # The dashboard intentionally visualizes a representative protocol exchange.
    # It does not perform real DNS/HTTP/SMTP traffic.
    return {"ok": True, "mode": a.mode, "action": a.action}
