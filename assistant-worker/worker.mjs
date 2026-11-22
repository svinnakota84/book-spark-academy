const instructions = [
  "You are Ask BookSpark, a general-purpose learning and news assistant.",
  "Answer the visitor's question clearly. Use web search for current or time-sensitive facts, especially news, and cite sources.",
  "Distinguish confirmed facts from uncertainty. Never invent headlines, sources, URLs, BookSpark policies, or account information.",
  "You cannot access customer accounts, process orders, or make changes to external systems.",
].join(" ");

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (new URL(request.url).pathname !== "/ask") return reply({ error: "Not found." }, 404);
    if (origin !== env.SITE_ORIGIN) return reply({ error: "Origin not allowed." }, 403);

    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Use POST." }, 405);

    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip || !env.OPENAI_API_KEY || !env.ASK_LIMIT) {
      return reply({ error: "Ask BookSpark is unavailable right now." }, 503);
    }
    const { success } = await env.ASK_LIMIT.limit({ key: ip });
    if (!success) return reply({ error: "Please wait a minute before asking again." }, 429);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
      return reply({ error: "Send JSON." }, 415);
    }

    let question;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: "Enter a question." }, 400);
      const decoder = new TextDecoder();
      let size = 0;
      let raw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 10000) {
          await reader.cancel();
          return reply({ error: "The question is too long." }, 413);
        }
        raw += decoder.decode(value, { stream: true });
      }
      const input = JSON.parse(raw + decoder.decode());
      question = typeof input?.question === "string" ? input.question.trim() : "";
    } catch {
      return reply({ error: "Invalid request." }, 400);
    }
    if (!question || question.length > 2000) {
      return reply({ error: "Enter a question of up to 2,000 characters." }, 400);
    }

    try {
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          instructions,
          input: question,
          max_output_tokens: 1000,
          store: false,
          tools: [{ type: "web_search" }],
          max_tool_calls: 2,
        }),
        signal: AbortSignal.timeout(50000),
      });
      if (!upstream.ok) return reply({ error: "The AI service is temporarily unavailable." }, 502);
      const result = await upstream.json();
      const messages = (result.output ?? [])
        .filter(item => item.type === "message" && item.role === "assistant")
        .flatMap(item => item.content ?? []);
      const answer = messages.map(item => item.text ?? item.refusal ?? "").filter(Boolean).join("\n\n");
      if (!answer) return reply({ error: "No answer was returned. Please try again." }, 502);

      const sources = new Map();
      for (const message of messages) {
        for (const annotation of message.annotations ?? []) {
          if (annotation.type !== "url_citation" || !annotation.url?.startsWith("https://")) continue;
          sources.set(annotation.url, annotation.title || annotation.url);
        }
      }
      return reply({ answer, sources: Array.from(sources, ([url, title]) => ({ url, title })) });
    } catch {
      return reply({ error: "The AI service is temporarily unavailable." }, 502);
    }
  },
};
