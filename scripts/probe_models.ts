import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const key = process.env.OPENCODE_API_KEY!;
const provider = createOpenAICompatible({
  name: "opencode-zen",
  baseURL: "https://opencode.ai/zen/v1",
  apiKey: key,
});

const probe = tool({ description: "Fetch an order by ID", inputSchema: z.object({ order_id: z.string() }), execute: async () => ({ ok: true }) });

async function main() {
  for (const model of process.argv.slice(2)) {
    try {
      const res = streamText({
        model: provider.chatModel(model),
        prompt: "Look up order ORD-1001 please.",
        tools: { get_order: probe },
        stopWhen: stepCountIs(3),
      });
      let sawTool = "";
      const parts: string[] = [];
      for await (const chunk of res.fullStream) {
        if (chunk.type === "tool-call") sawTool = `${chunk.toolName}(${JSON.stringify(chunk.input)})`;
        if (chunk.type === "text-delta") parts.push(chunk.text ?? "");
      }
      console.log(`${model} => ${sawTool ? `TOOLCALL ${sawTool}` : parts.join("").slice(0, 80) || "(no output)"}`);
    } catch (e) {
      console.log(`${model} => ERR ${(e as Error).message.slice(0, 120)}`);
    }
  }
}

void main();
