import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, get } from "node:http";
import { once } from "node:events";

test(
  "HTTP boundaries, model/tool round trip, persistence, and denied tools",
  { timeout: 120000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "rea-web-test-"));
    const sample = join(dir, "sample.js");
    await writeFile(sample, "export function score(n) { return n * 10; }");
    let calls = 0;
    let deny = false;
    const model = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      calls++;
      const outputs = body.messages.filter((m) => m.role === "tool");
      let message;
      if (!outputs.length)
        message = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: deny ? "capture_process_scenario" : "open_binary",
                arguments: JSON.stringify(
                  deny ? { command: "echo should-not-run" } : { path: sample },
                ),
              },
            },
          ],
        };
      else {
        const out = JSON.parse(outputs.at(-1).content);
        if (deny) assert.ok(out.isError);
        else assert.ok(!out.isError, JSON.stringify(out));
        message = {
          role: "assistant",
          content: deny
            ? "被拒绝的工具没有执行。"
            : "已读取自有 JavaScript 样例。",
        };
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
    model.listen(0, "127.0.0.1");
    await once(model, "listening");
    const port = 18790;
    const base = `http://127.0.0.1:${port}`;
    let child;
    async function start() {
      child = spawn(process.execPath, ["web/server.mjs"], {
        env: {
          ...process.env,
          REA_WEB_PORT: String(port),
          REA_WEB_DATA_DIR: dir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      await Promise.race([
        once(child.stdout, "data"),
        once(child, "exit").then(() => {
          throw new Error("server exited");
        }),
      ]);
    }
    const post = (path, value, headers = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-REA-Client": "web",
          ...headers,
        },
        body: JSON.stringify(value),
      });
    try {
      await start();
      assert.equal((await fetch(base)).status, 200);
      assert.equal(
        (await post("/api/sessions", {}, { Origin: "https://example.org" }))
          .status,
        403,
      );
      assert.equal(
        (await fetch(base + "/api/sessions", { method: "POST", body: "{}" }))
          .status,
        403,
      );
      const hostStatus = await new Promise((resolve, reject) => {
        get(
          base + "/api/config",
          { headers: { Host: "evil.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        ).on("error", reject);
      });
      assert.equal(hostStatus, 403);
      let r = await post("/api/config", {
        baseUrl: `http://127.0.0.1:${model.address().port}/v1`,
        model: "test-model",
        apiKey: "test-only",
      });
      assert.equal(r.status, 200);
      assert.ok(!(await r.text()).includes("test-only"));
      const s = await (
        await post("/api/sessions", { title: "integration test" })
      ).json();
      r = await post("/api/chat", { id: s.id, message: `分析 ${sample}` });
      let events = (await r.text()).trim().split("\n").map(JSON.parse);
      assert.ok(
        events.some((e) => e.type === "answer"),
        JSON.stringify(events),
      );
      assert.ok(
        events.some(
          (e) =>
            e.type === "tool_result" &&
            e.name === "open_binary" &&
            !e.output.isError,
        ),
      );
      assert.equal(calls, 2);
      deny = true;
      r = await post("/api/chat", { id: s.id, message: "验证被禁止的工具" });
      events = (await r.text()).trim().split("\n").map(JSON.parse);
      assert.ok(
        events.some(
          (e) => e.name === "capture_process_scenario" && e.output.isError,
        ),
      );
      const saved = await (await fetch(base + `/api/sessions/${s.id}`)).json();
      assert.equal(saved.messages.length, 4);
      assert.equal(saved.events.length, 2);
      child.kill("SIGTERM");
      await once(child, "exit");
      await start();
      const restored = await (
        await fetch(base + `/api/sessions/${s.id}`)
      ).json();
      assert.equal(restored.messages.length, 4);
      assert.equal(
        (await (await fetch(base + "/api/config")).json()).configured,
        false,
      );
    } finally {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      model.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
