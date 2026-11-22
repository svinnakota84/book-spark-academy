// Set this to the deployed HTTPS Worker /ask URL before publishing.
const ASK_ENDPOINT = "";

const panel = document.querySelector("#ask-bookspark");
const form = panel.querySelector("form");
const status = panel.querySelector("[data-ask-status]");
const answer = panel.querySelector("[data-ask-answer]");
const sources = panel.querySelector("[data-ask-sources]");
const question = form.elements.question;
const submit = form.querySelector("button");

if (ASK_ENDPOINT) {
  status.textContent = "Ask about today’s headlines, a course topic, or another subject.";
  form.hidden = false;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = question.value.trim();
  if (!value || submit.disabled || !ASK_ENDPOINT) return;
  submit.disabled = true;
  status.textContent = "Looking into your question…";
  answer.textContent = "";
  sources.replaceChildren();

  try {
    const response = await fetch(ASK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: value }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json();
    if (!response.ok || !data.answer) {
      status.textContent = data.error || "Ask BookSpark is unavailable right now.";
      return;
    }

    answer.textContent = data.answer;
    for (const source of data.sources) {
      if (!source.url.startsWith("https://")) continue;
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.title;
      li.append(link);
      sources.append(li);
    }
    status.textContent = "Answer ready.";
    answer.focus();
  } catch {
    status.textContent = "Ask BookSpark is unavailable right now. Please try again.";
  } finally {
    submit.disabled = false;
  }
});
