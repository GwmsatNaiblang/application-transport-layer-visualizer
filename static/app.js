const $ = id => document.getElementById(id);

let mode = "browsing";
let layer = "application";
let timeline = [];
let index = -1;
let timer = null;
let playing = false;

const APP = (protocol, event, direction, payload) => ({protocol, event, direction, payload});

function tcp(seq, ack, flags, win, direction, length=0, time="—", note="") {
  return {protocol:"TCP", event:flags, direction, seq, ack, flags, win, length, time, note};
}

function makeBrowsing() {
  const raw = $("url").value.trim() || "https://example.com";
  let u; try { u = new URL(raw.includes("://") ? raw : "https://" + raw); }
  catch { u = new URL("https://example.com"); }
  const host=u.hostname, path=u.pathname || "/";
  const ip="93.184.216.34";
  return [
    {time:"0 ms", phase:"DNS query", app:APP("DNS","Query","Client → DNS resolver",`A / AAAA ${host}`), transport:null},
    {time:"18 ms", phase:"DNS response", app:APP("DNS","Response","DNS resolver → Client",`Answer: ${ip}  TTL 300`), transport:null},
    {time:"25 ms", phase:"TCP connection", app:null, transport:tcp(1000,0,"SYN",64240,"Client → Server",0,"25 ms","Client ISN = 1000")},
    {time:"36 ms", phase:"TCP connection", app:null, transport:tcp(5000,1001,"SYN-ACK",65535,"Server → Client",0,"36 ms","Server ISN = 5000; SYN acknowledges client 1000")},
    {time:"42 ms", phase:"TCP connection", app:null, transport:tcp(1001,5001,"ACK",64240,"Client → Server",0,"42 ms","Handshake complete; next client Seq = 1001")},
    {time:"48 ms", phase:"HTTP request", app:APP("HTTP","Request","Client → "+host,`GET ${path} HTTP/1.1\nHost: ${host}\nAccept: text/html`), transport:tcp(1001,5001,"PSH, ACK",64240,"Client → Server",300,"48 ms","Payload length = 300 bytes; next client Seq = 1301")},
    {time:"67 ms", phase:"HTTP request ACK", app:null, transport:tcp(5001,1301,"ACK",65535,"Server → Client",0,"67 ms","Acknowledges all 300 request bytes")},
    {time:"72 ms", phase:"HTTP response", app:APP("HTTP","Response",host+" → Client",`HTTP/1.1 200 OK\nContent-Type: text/html\nContent-Length: 1200`), transport:tcp(5001,1301,"PSH, ACK",65535,"Server → Client",1200,"72 ms","Payload length = 1200 bytes; next server Seq = 6201")},
    {time:"91 ms", phase:"HTTP response ACK", app:APP("HTTP","Payload","Server → Client","<html> … response body … </html>"), transport:tcp(1301,6201,"ACK",64240,"Client → Server",0,"91 ms","Client acknowledges response through Seq 6200")},
    {time:"96 ms", phase:"TCP teardown", app:null, transport:tcp(1301,6201,"FIN, ACK",64240,"Client → Server",0,"96 ms","Client requests orderly close; FIN consumes one sequence number")},
    {time:"105 ms", phase:"TCP teardown", app:null, transport:tcp(6201,1302,"ACK",65535,"Server → Client",0,"105 ms","ACK for client FIN")},
    {time:"112 ms", phase:"TCP teardown", app:null, transport:tcp(6201,1302,"FIN, ACK",65535,"Server → Client",0,"112 ms","Server closes its direction; FIN consumes one sequence number")},
    {time:"120 ms", phase:"TCP teardown", app:null, transport:tcp(1302,6202,"ACK",64240,"Client → Server",0,"120 ms","Final ACK; TCP state becomes CLOSED")}
  ];
}

function makeMail() {
  const to=$("to").value.trim() || "receiver@example.com";
  const subject=$("subject").value.trim() || "Hello";
  const body=$("body").value.trim() || "Message body";
  const dataLen = Math.max(120, subject.length + body.length + 40);

  // Representative byte counts keep Seq/Ack progression internally consistent.
  const ehlo=80, ehloReply=55, mailFrom=70, mailReply=20, rcpt=65, rcptReply=20;
  const dataEnd=2216+dataLen, dataReply=55, quit=18, quitReply=15;

  return [
    {time:"0 ms",phase:"TCP connection",app:null,transport:tcp(2000,0,"SYN",64240,"Mail client → SMTP server",0,"0 ms","Client ISN = 2000")},
    {time:"11 ms",phase:"TCP connection",app:null,transport:tcp(7000,2001,"SYN-ACK",65535,"SMTP server → Mail client",0,"11 ms","Server ISN = 7000")},
    {time:"17 ms",phase:"TCP connection",app:null,transport:tcp(2001,7001,"ACK",64240,"Mail client → SMTP server",0,"17 ms","Handshake complete; next client Seq = 2001")},
    {time:"24 ms",phase:"SMTP EHLO",app:APP("SMTP","EHLO","Client → mail.example.com","EHLO client.example.com\n250-mail.example.com"),transport:tcp(2001,7001,"PSH, ACK",64240,"Mail client → SMTP server",ehlo,"24 ms","EHLO consumes 80 representative bytes; next client Seq = 2081")},
    {time:"31 ms",phase:"SMTP EHLO response",app:APP("SMTP","250 OK","mail.example.com → Client","250-mail.example.com\n250 AUTH LOGIN"),transport:tcp(7001,2081,"PSH, ACK",65535,"SMTP server → Mail client",ehloReply,"31 ms","Server response advances server Seq to 7056")},
    {time:"38 ms",phase:"SMTP MAIL FROM",app:APP("SMTP","MAIL FROM","Client → mail.example.com","MAIL FROM:<sender@example.com>\n250 2.1.0 OK"),transport:tcp(2081,7056,"PSH, ACK",64240,"Mail client → SMTP server",mailFrom,"38 ms","Ordered SMTP command; next client Seq = 2151")},
    {time:"42 ms",phase:"SMTP MAIL FROM response",app:APP("SMTP","250 2.1.0","mail.example.com → Client","250 2.1.0 OK"),transport:tcp(7056,2151,"PSH, ACK",65535,"SMTP server → Mail client",mailReply,"42 ms","Server acknowledges MAIL FROM; next server Seq = 7076")},
    {time:"48 ms",phase:"SMTP RCPT TO",app:APP("SMTP","RCPT TO","Client → mail.example.com",`RCPT TO:<${to}>\n250 2.1.5 OK`),transport:tcp(2151,7076,"PSH, ACK",64240,"Mail client → SMTP server",rcpt,"48 ms","TCP stream preserves SMTP command order; next client Seq = 2216")},
    {time:"53 ms",phase:"SMTP RCPT response",app:APP("SMTP","250 2.1.5","mail.example.com → Client","250 2.1.5 OK"),transport:tcp(7076,2216,"PSH, ACK",65535,"SMTP server → Mail client",rcptReply,"53 ms","Server acknowledges RCPT TO; next server Seq = 7096")},
    {time:"60 ms",phase:"SMTP DATA",app:APP("SMTP","DATA","Client → mail.example.com",`DATA\nSubject: ${subject}\n\n${body}\n.`),transport:tcp(2216,7096,"PSH, ACK",64240,"Mail client → SMTP server",dataLen,"60 ms",`Message payload ≈ ${dataLen} bytes; next client Seq = ${dataEnd}`)},
    {time:"75 ms",phase:"SMTP accepted",app:APP("SMTP","250 Accepted","mail.example.com → Client","250 2.0.0 Message accepted for delivery"),transport:tcp(7096,dataEnd,"PSH, ACK",65535,"SMTP server → Mail client",dataReply,"75 ms",`Server response advances server Seq to ${7096+dataReply}`)},
    {time:"83 ms",phase:"SMTP QUIT",app:APP("SMTP","QUIT","Client → mail.example.com","QUIT\n221 2.0.0 Bye"),transport:tcp(dataEnd,7151,"PSH, ACK",64240,"Mail client → SMTP server",quit,"83 ms",`QUIT follows the DATA exchange; next client Seq = ${dataEnd+quit}`)},
    {time:"89 ms",phase:"SMTP closing response",app:APP("SMTP","221 Bye","mail.example.com → Client","221 2.0.0 Bye"),transport:tcp(7151,dataEnd+quit,"PSH, ACK",65535,"SMTP server → Mail client",quitReply,"89 ms","Final SMTP response; next server Seq = 7166")},
    {time:"96 ms",phase:"TCP teardown",app:null,transport:tcp(dataEnd+quit,7166,"FIN, ACK",64240,"Mail client → SMTP server",0,"96 ms","Client FIN; FIN consumes one sequence number")},
    {time:"104 ms",phase:"TCP teardown",app:null,transport:tcp(7166,dataEnd+quit+1,"ACK",65535,"SMTP server → Mail client",0,"104 ms","ACK for client FIN")},
    {time:"111 ms",phase:"TCP teardown",app:null,transport:tcp(7166,dataEnd+quit+1,"FIN, ACK",65535,"SMTP server → Mail client",0,"111 ms","Server FIN; FIN consumes one sequence number")},
    {time:"119 ms",phase:"TCP teardown",app:null,transport:tcp(dataEnd+quit+1,7167,"ACK",64240,"Mail client → SMTP server",0,"119 ms","Final ACK; TCP CLOSED")}
  ];
}
function makeStreaming() {
  const q=$("quality").value;
  const base=1000;
  return [
    {time:"0 ms",phase:"DNS query",app:APP("DNS","Query","Player → DNS resolver","A/AAAA video.example.com"),transport:null},
    {time:"16 ms",phase:"DNS response",app:APP("DNS","Response","DNS resolver → Player","Answer: 203.0.113.10"),transport:null},
    {time:"23 ms",phase:"TCP connection",app:null,transport:tcp(base,0,"SYN",65535,"Player → CDN",0,"23 ms","TCP connection for HTTP manifest")},
    {time:"34 ms",phase:"TCP connection",app:null,transport:tcp(5000,base+1,"SYN-ACK",65535,"CDN → Player",0,"34 ms","CDN acknowledges SYN")},
    {time:"40 ms",phase:"TCP connection",app:null,transport:tcp(base+1,5001,"ACK",65535,"Player → CDN",0,"40 ms","TCP established")},
    {time:"47 ms",phase:"HTTP manifest",app:APP("HTTP","Manifest","Player → CDN","GET /video/master.m3u8 HTTP/1.1\nHost: video.example.com"),transport:tcp(base+1,5001,"PSH, ACK",65535,"Player → CDN",180,"47 ms","Reliable TCP delivery of manifest request")},
    {time:"61 ms",phase:"Manifest response",app:APP("HTTP","Manifest response","CDN → Player","200 OK\nContent-Type: application/vnd.apple.mpegurl"),transport:tcp(5001,base+181,"PSH, ACK",65535,"CDN → Player",700,"61 ms","Manifest bytes delivered reliably")},
    {time:"77 ms",phase:"Segment 1",app:APP("HTTP","Segment 1","Player → CDN",`GET /video/seg-001-${q}.m4s`),transport:tcp(base+181,5701,"PSH, ACK",65535,"Player → CDN",120,"77 ms","Reliable TCP media request")},
    {time:"92 ms",phase:"Segment 1 response",app:APP("HTTP","Segment 1 data","CDN → Player","200 OK • media segment 001"),transport:tcp(5701,base+301,"PSH, ACK",65535,"CDN → Player",4000,"92 ms","TCP carries ordered segment bytes")},
    {time:"108 ms",phase:"Segment 2",app:APP("HTTP","Segment 2","Player → CDN",`GET /video/seg-002-${q}.m4s`),transport:tcp(base+301,9701,"PSH, ACK",65535,"Player → CDN",120,"108 ms","Reliable TCP media request")},
    {time:"123 ms",phase:"Segment 2 response",app:APP("HTTP","Segment 2 data","CDN → Player","200 OK • media segment 002"),transport:tcp(9701,base+421,"PSH, ACK",65535,"CDN → Player",4000,"123 ms","TCP retransmission would occur if loss were detected")},
    {time:"139 ms",phase:"Segment 3",app:APP("HTTP","Segment 3","Player → CDN",`GET /video/seg-003-${q}.m4s`),transport:tcp(base+421,13701,"PSH, ACK",65535,"Player → CDN",120,"139 ms","Reliable TCP media request")},
    {time:"154 ms",phase:"UDP comparison",app:APP("UDP","Comparison","Player → Real-time media source","UDP datagrams have no TCP-style handshake, sequence ACK or retransmission."),transport:{protocol:"UDP",event:"DATAGRAM",direction:"Media source → Player",seq:"—",ack:"—",flags:"—",win:"—",length:1200,time:"154 ms",note:"Optional comparison: connectionless delivery; loss handling is application-dependent."}},
    {time:"168 ms",phase:"TCP teardown",app:null,transport:tcp(base+541,13701,"FIN, ACK",65535,"Player → CDN",0,"168 ms","HTTP/TCP session closed")},
    {time:"176 ms",phase:"TCP teardown",app:null,transport:tcp(13701,base+542,"ACK",65535,"CDN → Player",0,"176 ms","ACK for client FIN")},
    {time:"184 ms",phase:"TCP teardown",app:null,transport:tcp(13701,base+542,"FIN, ACK",65535,"CDN → Player",0,"184 ms","Server FIN")},
    {time:"192 ms",phase:"TCP teardown",app:null,transport:tcp(base+542,13702,"ACK",65535,"Player → CDN",0,"192 ms","Final ACK; TCP CLOSED")}
  ];
}

function buildFlow() {
  if(mode==="browsing") return makeBrowsing();
  if(mode==="mail") return makeMail();
  return makeStreaming();
}

function setStatus(text){ $("status").textContent=text; }

function render(){
  $("steps").innerHTML="";
  timeline.forEach((e,i)=>{
    const el=document.createElement("div");
    el.className="step "+(i<index?"done ":"")+(i===index?"current":"");
    const appText=e.app ? `${e.app.protocol} • ${e.app.event}` : "Transport-only event";
    const transportText=e.transport ? `${e.transport.protocol} ${e.transport.event}` : "—";
    el.innerHTML=`
      <div class="num">${i+1}</div>
      <div>
        <div class="layer">${escapeHtml(e.phase)}</div>
        <div class="title">${escapeHtml(appText)}</div>
        <div class="detail">${escapeHtml(e.app?.direction || "No new application message")}</div>
      </div>
      <div class="mini-transport">${escapeHtml(transportText)}</div>`;
    el.onclick=()=>{index=i; stop(); render();};
    $("steps").appendChild(el);
  });

  const total=timeline.length;
  $("stepCounter").textContent=`Step ${total ? index+1 : 0} / ${total}`;
  $("bar").style.width=total && index>=0 ? `${((index+1)/total)*100}%` : "0%";

  if(index<0){
    $("appCard").className="focus-card empty";
    $("appCard").textContent="Trigger an activity to start the visualization.";
    $("transportCard").className="focus-card empty";
    $("transportCard").textContent="Trigger an activity to start the visualization.";
    $("timing").textContent="t = —";
    $("appState").textContent="Waiting";
    $("tcpState").textContent="CLOSED";
  } else {
    const e=timeline[index];
    $("timing").textContent=`t = ${e.time}`;

    if(e.app){
      $("appCard").className="focus-card";
      $("appCard").innerHTML=`
        <div class="focus-top"><span class="protocol">${escapeHtml(e.app.protocol)}</span><span class="event">${escapeHtml(e.app.event)}</span></div>
        <div class="direction">${escapeHtml(e.app.direction)}</div>
        <pre>${escapeHtml(e.app.payload)}</pre>`;
      $("appState").textContent=e.app.event;
    } else {
      $("appCard").className="focus-card muted-card";
      $("appCard").innerHTML=`<div class="focus-top"><span class="protocol">No new application message</span></div>
      <div class="direction">The application layer is idle while the transport layer performs ${escapeHtml(e.phase)}.</div>`;
      $("appState").textContent="Waiting";
    }

    if(e.transport){
      const t=e.transport;
      $("transportCard").className="focus-card";
      $("transportCard").innerHTML=`
        <div class="focus-top"><span class="protocol">${escapeHtml(t.protocol)}</span><span class="event">${escapeHtml(t.event)}</span></div>
        <div class="direction">${escapeHtml(t.direction)}</div>
        <div class="tcp-grid">
          <div><b>Seq</b><span>${escapeHtml(String(t.seq))}</span></div>
          <div><b>Ack</b><span>${escapeHtml(String(t.ack))}</span></div>
          <div><b>Flags</b><span>${escapeHtml(t.flags)}</span></div>
          <div><b>Window</b><span>${escapeHtml(String(t.win))}</span></div>
          <div><b>Payload</b><span>${escapeHtml(String(t.length))} bytes</span></div>
          <div><b>Timing</b><span>${escapeHtml(t.time)}</span></div>
        </div>
        <div class="note">${escapeHtml(t.note)}</div>`;
      if(t.protocol==="UDP") $("tcpState").textContent="CONNECTIONLESS";
      else if(t.event==="SYN") $("tcpState").textContent="SYN-SENT";
      else if(t.event==="SYN-ACK") $("tcpState").textContent="SYN-RECEIVED";
      else if(e.phase==="TCP teardown" && t.event==="FIN, ACK" && /Client|Player|Mail client/.test(t.direction)) $("tcpState").textContent="FIN-WAIT-1";
      else if(e.phase==="TCP teardown" && t.event==="ACK" && index===timeline.length-1) $("tcpState").textContent="CLOSED";
      else if(e.phase==="TCP teardown" && t.event==="ACK") $("tcpState").textContent="FIN-WAIT-2";
      else if(e.phase==="TCP teardown" && t.event==="FIN, ACK") $("tcpState").textContent="LAST-ACK";
      else $("tcpState").textContent="ESTABLISHED";
    } else {
      $("transportCard").className="focus-card muted-card";
      $("transportCard").innerHTML=`<div class="focus-top"><span class="protocol">No transport packet</span></div>
      <div class="direction">DNS is shown at the Application/DNS layer in this educational flow. The TCP connection is created when the application starts its TCP-based exchange.</div>`;
      $("tcpState").textContent="—";
    }

    const t=e.transport;
    $("packet").textContent = t
      ? `${t.protocol} / ${t.event}\n${t.direction}\nSeq=${t.seq}  Ack=${t.ack}  Flags=${t.flags}  Window=${t.win}  Payload=${t.length} bytes\n${t.note}`
      : e.app ? `${e.app.protocol} / ${e.app.event}\n${e.app.direction}\n\n${e.app.payload}` : e.phase;
  }
  $("toggle").textContent=playing?"Ⅱ":"▶";
}

function escapeHtml(x){
  return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function startFlow(title){
  stop();
  timeline=buildFlow();
  index=0;
  playing=true;
  $("flowTitle").textContent=title;
  setStatus("Running");
  render();
  timer=setInterval(next,900);
}

function next(){
  if(index < timeline.length-1){index++;render();}
  else {stop();setStatus("Complete");render();}
}
function prev(){stop();index=Math.max(0,index-1);setStatus("Paused");render();}
function stop(){
  playing=false;
  if(timer){clearInterval(timer);timer=null;}
  render();
}
function replay(){
  if(!timeline.length)return;
  stop(); index=0; playing=true; setStatus("Running"); render();
  timer=setInterval(next,900);
}

function sendActivity(action){
  fetch("/api/activity",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      mode,url:$("url").value,to:$("to").value,subject:$("subject").value,
      body:$("body").value,quality:$("quality").value,action
    })
  }).catch(()=>{});
}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".mode").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); mode=b.dataset.mode; $(mode).classList.add("active");
  stop(); timeline=[]; index=-1; setStatus("Ready");
  $("flowTitle").textContent="Waiting for "+mode+" activity…"; render();
});

document.querySelectorAll(".layer-tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".layer-tab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); layer=b.dataset.layer;
  document.querySelectorAll(".layer-view").forEach(x=>x.classList.remove("active"));
  $(layer+"View").classList.add("active");
});

$("visit").onclick=()=>{sendActivity("visit");startFlow("Browsing: "+$("url").value);};
$("send").onclick=()=>{sendActivity("send");startFlow("Mail: SMTP over TCP");};
$("play").onclick=()=>{sendActivity("play");startFlow("Streaming: "+$("quality").value);};
$("pause").onclick=()=>{sendActivity("pause");stop();setStatus("Paused");};
$("next").onclick=next;
$("prev").onclick=prev;
$("replay").onclick=replay;
$("toggle").onclick=()=>{
  if(playing){stop();setStatus("Paused");}
  else if(timeline.length){playing=true;setStatus("Running");timer=setInterval(next,900);render();}
};
$("quality").onchange=()=>{
  if(mode==="streaming" && timeline.length){
    sendActivity("quality-change"); startFlow("Streaming: "+$("quality").value);
  }
};
render();