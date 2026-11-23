// Configure the deployed HTTPS /ask endpoint when live AI is available.
const ASK_ENDPOINT = "";

const panel = document.querySelector("#ask-bookspark");
const form = panel.querySelector("form");
const status = panel.querySelector("[data-ask-status]");
const answer = panel.querySelector("[data-ask-answer]");
const sources = panel.querySelector("[data-ask-sources]");
const question = form.elements.question;
const submit = form.querySelector("button");
const help = [
  { match: /\b(sign[ -]?in|log[ -]?in|account|password|email link|magic link)\b/i,
    title: "Sign-in and course access", href: "learning.html#learning-steps",
    answer: "Customer sign-in is currently closed. When enrollment opens, sign in by email and use the same account in My Learning after payment clears." },
  { match: /\b(membership|subscri\w*|pay\w*|checkout|price|pricing|cost|buy|refund\w*|billing|cancel\w*)\b/i,
    title: "Planned paid options", href: "index.html#membership",
    answer: "Paid enrollment is closed. The proposed $15 USD monthly plan includes all six introductory modules. The planned one-time option unlocks one selected module. BookSpark checkout is not accepting payments." },
  { match: /\b(certif\w*|exam|assess\w*|quiz|pass\w*|grade|score)\b/i,
    title: "Assessment and certificate steps", href: "learning.html#learning-steps",
    answer: "The planned BookSpark Certificate of Completion requires finishing the module and scoring at least four out of five on its assessment. Customers cannot earn certificates on the live site yet." },
  { match: /\b(preview|sample|free|try)\b/i,
    title: "Watch the free captioned sample", href: "learning.html#training-preview",
    answer: "The public preview includes written introductions and one captioned video sample from Practical AI for Everyday Work. You do not need an account to watch the sample." },
  { match: /\b(course\w*|lesson\w*|video\w*|module\w*|training|library|learn\w*)\b/i,
    title: "Browse the six modules", href: "learning.html#member-library",
    answer: "The introductory library covers practical AI, business models, news literacy, small-business automation, business headlines, and data literacy. Each prepared module includes a video, captions, written lessons, and an exercise. Full access is awaiting enrollment launch." },
  { match: /\b(news|headlines|sources|daily brief)\b/i,
    title: "Read the Daily Brief", href: "index.html#daily",
    answer: "The Daily Brief links to original publisher pages so you can check headlines against the source." },
  { match: /\b(pilot|business support|furniture|seller|vendor|delivery|damag\w*|return\w*)\b/i,
    title: "See the business pilot and seller guidance", href: "index.html#furniture-assistant",
    answer: "BookSpark offers a pilot for businesses that want a support assistant based on their approved FAQs. For a furniture order, contact the seller about delivery, damage, returns, or warranties." },
];
const contact = { title: "Email BookSpark support", href: "mailto:info@radiantsparkllc.com" };

function showResponse(message, links, label) {
  answer.textContent = message;
  sources.replaceChildren();
  for (const item of links) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.title;
    li.append(link);
    sources.append(li);
  }
  status.textContent = label;
  answer.focus();
}

function showHelp(value) {
  const matches = help.filter(item => item.match.test(value)).slice(0, 3);
  if (matches.length) {
    showResponse(matches.map(item => item.answer).join("\n\n"), [...matches, contact],
      "Answer from the BookSpark help guide.");
  } else {
    showResponse("I couldn't match that question to the BookSpark help guide. Email support for help with your situation.", [contact],
      "Contact BookSpark support.");
  }
}

if (ASK_ENDPOINT) {
  status.textContent = "Ask about BookSpark, course topics, or today’s headlines.";
  panel.querySelector("[data-ask-ai-notice]").hidden = false;
}

panel.querySelectorAll("[data-ask-question]").forEach(button => {
  button.addEventListener("click", () => {
    question.value = button.textContent.trim();
    showHelp(question.value);
  });
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = question.value.trim();
  if (!value || submit.disabled) return;
  if (!ASK_ENDPOINT || help.some(item => item.match.test(value))) {
    showHelp(value);
    return;
  }

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
    if (!response.ok || typeof data.answer !== "string" || !data.answer.trim()) {
      showHelp(value);
      return;
    }
    const links = (Array.isArray(data.sources) ? data.sources : [])
      .filter(source => typeof source?.url === "string" && source.url.startsWith("https://"))
      .map(source => ({ href: source.url, title: source.title || source.url }));
    showResponse(data.answer, links, "AI answer ready.");
  } catch {
    showHelp(value);
  } finally {
    submit.disabled = false;
  }
});
