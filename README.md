# Live Protocol Visualizer — Application + Transport Layers

This version extends the existing Application Layer dual-panel dashboard.

## What changed

- Left Activity panel remains **Browsing / Mail / Streaming**.
- Right panel now has:
  - **Application Layer** tab
  - **Transport Layer** tab
- Both layer views are driven by one synchronized master timeline.
- **Pause / Play, Next, Previous and Replay** control both layers together.
- TCP visualization includes:
  - SYN
  - SYN-ACK
  - ACK
  - PSH, ACK data segments
  - FIN, ACK
  - sequence number
  - acknowledgement number
  - flags
  - advertised window
  - payload length
  - direction
  - timing
  - simplified TCP state transitions
- Browsing: DNS + HTTP synchronized with TCP connection, HTTP request/response, ACKs and teardown.
- Mail: SMTP conversation carried by a TCP lifecycle.
- Streaming: DNS + HTTP manifest/segments carried by TCP, plus a UDP comparison event showing connectionless delivery.
- No real network traffic is generated; flows are educational simulations.

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open `http://127.0.0.1:8000`.

## Render

Use the repository containing this project and configure a Web Service.

Build command:
```bash
pip install -r requirements.txt
```

Start command:
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```
