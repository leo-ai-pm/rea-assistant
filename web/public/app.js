const $ = (s) => document.querySelector(s);
let current = null,
  records = [],
  busy = false,
  controller;
async function api(path, body) {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-REA-Client": "web",
          },
          body: JSON.stringify(body),
        }
      : {},
  );
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "请求失败");
  return value;
}
const status = (t) => {
  $("#status").textContent = t;
};
function message(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role === "user" ? "你" : "REA · 拆解助手";
  const text = document.createElement("div");
  text.textContent = content;
  div.append(who, text);
  $("#messages").append(div);
  $("#conversation").scrollTop = $("#conversation").scrollHeight;
}
function event(e) {
  if ($("#events .empty")) $("#events").replaceChildren();
  const d = document.createElement("details");
  const s = document.createElement("summary");
  s.textContent = `${e.output?.isError ? "!" : "↳"} ${e.name}`;
  const p = document.createElement("pre");
  p.textContent = JSON.stringify(e.output, null, 2);
  d.append(s, p);
  $("#events").append(d);
  $("#count").textContent = records.length;
}
async function list() {
  const rows = await api("/api/sessions");
  $("#sessions").replaceChildren();
  for (const row of rows) {
    const b = document.createElement("button");
    b.textContent = row.title;
    b.className = row.id === current ? "active" : "";
    b.disabled = busy;
    b.onclick = () => open(row.id).catch((e) => status(e.message));
    $("#sessions").append(b);
  }
}
async function open(id) {
  const s = await api(`/api/sessions/${id}`);
  current = id;
  location.hash = id;
  $("#title").textContent = s.title;
  $("#messages").replaceChildren();
  $("#welcome").hidden = s.messages.length > 0;
  for (const m of s.messages) message(m.role, m.content);
  records = s.events;
  $("#events").replaceChildren();
  for (const e of records) event(e);
  $("#count").textContent = records.length;
  await list();
}
async function fresh() {
  current = null;
  location.hash = "";
  records = [];
  $("#count").textContent = "0";
  $("#events").replaceChildren();
  $("#messages").replaceChildren();
  $("#welcome").hidden = false;
  $("#title").textContent = "新建分析";
  await list();
  $("#prompt").focus();
}
function setBusy(value) {
  busy = value;
  $("#send").disabled = value;
  $("#new").disabled = value;
  $("#stop").hidden = !value;
  $("#prompt").disabled = value;
  $("#settings").disabled = value;
  for (const b of $("#sessions").children) b.disabled = value;
}
$("#new").onclick = () => fresh().catch((e) => status(e.message));
$("#evidence-toggle").onclick = () => {
  $("#evidence").hidden = !$("#evidence").hidden;
};
$("#close-evidence").onclick = () => {
  $("#evidence").hidden = true;
};
$("#settings").onclick = async () => {
  try {
    const c = await api("/api/config");
    $("#base-url").value = c.baseUrl;
    $("#model").value = c.model;
    $("#config").showModal();
  } catch (e) {
    status(e.message);
  }
};
$("#close-config").onclick = () => $("#config").close();
$("#config-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/api/config", {
      baseUrl: $("#base-url").value,
      model: $("#model").value,
      apiKey: $("#key").value,
    });
    $("#key").value = "";
    $("#config-error").textContent = "";
    $("#config").close();
    status("模型已配置，可以开始分析");
  } catch (e) {
    $("#config-error").textContent = e.message;
  }
};
for (const b of document.querySelectorAll("[data-prompt]"))
  b.onclick = () => {
    $("#prompt").value = b.dataset.prompt;
    $("#prompt").focus();
  };
$("#stop").onclick = () => {
  controller?.abort();
  status("已停止接收分析，请稍候再继续");
};
$("#composer").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("#prompt").value.trim();
  if (!text || busy) return;
  setBusy(true);
  try {
    const c = await api("/api/config");
    if (!c.configured) {
      $("#config").showModal();
      throw new Error("先连接模型，再开始分析");
    }
    if (!current) {
      const s = await api("/api/sessions", { title: text.slice(0, 28) });
      current = s.id;
      location.hash = current;
      $("#title").textContent = s.title;
    }
    $("#welcome").hidden = true;
    message("user", text);
    $("#prompt").value = "";
    controller = new AbortController();
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-REA-Client": "web" },
      body: JSON.stringify({ id: current, message: text }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error((await r.json()).error);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const data = JSON.parse(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        if (data.type === "answer") {
          message("assistant", data.text);
          status("分析完成 · 可以继续追问");
        }
        if (data.type === "status") status(data.text);
        if (data.type === "tool_start") status(`正在调用 ${data.name}`);
        if (data.type === "tool_result") {
          records.push(data);
          event(data);
        }
        if (data.type === "error") {
          status(data.text);
          if (!records.length) $("#prompt").value = text;
        }
      }
    }
  } catch (e) {
    status(e.name === "AbortError" ? "分析已停止" : e.message);
  } finally {
    setBusy(false);
    await list();
  }
};
$("#prompt").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
};
$("#export").onclick = async () => {
  try {
    if (!current) return status("先创建一个分析会话");
    const s = await api(`/api/sessions/${current}`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `rea-${current}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    status(e.message);
  }
};
try {
  const c = await api("/api/config");
  status(
    c.configured
      ? `模型 ${c.model} · 准备就绪`
      : "点击「模型设置」，连接你的模型服务",
  );
  if (location.hash.length > 1) await open(location.hash.slice(1));
  else await list();
} catch (e) {
  status(e.message);
}
