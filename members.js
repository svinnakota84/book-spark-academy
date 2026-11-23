// Only public Supabase configuration belongs here. Empty values keep enrollment closed.
const projectUrl = "";
const publishableKey = "";
const section = document.querySelector("#member-library");
const status = section.querySelector("[data-member-status]");
const form = section.querySelector("[data-member-login]");
const account = section.querySelector("[data-member-account]");
const cards = section.querySelector("[data-member-courses]");
const player = section.querySelector("[data-member-player]");
const subscribe = section.querySelector("[data-buy-membership]");
const billing = section.querySelector("[data-manage-membership]");
let auth;
let catalog = [];
let access = null;

async function call(action, data = {}) {
  const { data: sessionData } = await auth.auth.getSession();
  if (!sessionData.session) throw new Error("Please sign in first.");
  const response = await fetch(`${projectUrl}/functions/v1/bookspark-members/${action}`, {
    method: "POST",
    headers: { Authorization: "Bearer " + sessionData.session.access_token, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}

function button(label, action) {
  const control = document.createElement("button");
  control.className = "btn";
  control.type = "button";
  control.textContent = label;
  control.addEventListener("click", () => perform(control, action));
  return control;
}

async function perform(control, action) {
  control.disabled = true;
  try {
    await action();
  } catch (error) {
    status.textContent = error.message || "Please try again.";
  } finally {
    control.disabled = false;
  }
}

function renderCourses() {
  cards.replaceChildren();
  for (const course of catalog) {
    const card = document.createElement("article");
    const title = document.createElement("h3");
    const goal = document.createElement("p");
    title.textContent = course.title;
    goal.textContent = course.goal;
    card.append(title, goal);
    if (access?.member || access?.purchased.includes(course.slug)) {
      card.append(button("Play course", () => play(course)));
    } else if (access) {
      card.append(button("Buy this course", () => purchase({ offer: "course", course: course.slug })));
    }
    cards.append(card);
  }
}

async function play(course) {
  const files = await call("play", { course: course.slug });
  const video = player.querySelector("video");
  video.pause();
  video.replaceChildren();
  const track = document.createElement("track");
  track.kind = "captions";
  track.src = files.captions;
  track.srclang = "en";
  track.label = "English";
  track.default = true;
  video.append(track);
  video.src = files.video;
  player.querySelector("h3").textContent = course.title;
  player.querySelector("[data-lesson-notes]").href = files.notes;
  player.hidden = false;
  video.focus();
}

async function purchase(offer) {
  const result = await call("checkout", offer);
  window.location.assign(result.url);
}

async function loadAccount() {
  const { data } = await auth.auth.getSession();
  const signedIn = Boolean(data.session);
  form.hidden = signedIn;
  account.hidden = !signedIn;
  access = null;
  renderCourses();
  player.hidden = true;
  if (!signedIn) {
    player.querySelector("video").removeAttribute("src");
    player.querySelector("video").load();
    status.textContent = "Sign in to view your courses and purchase options.";
    return;
  }
  status.textContent = "Checking course access…";
  access = await call("library");
  const returned = new URLSearchParams(location.search).get("payment") === "return";
  subscribe.hidden = access.member || returned;
  if (returned) {
    // Payment can settle after the hosted checkout redirects back.
    const previous = JSON.stringify(access);
    for (const delay of [1000, 2000, 4000]) {
      if (access.member || JSON.stringify(access) !== previous) break;
      await new Promise(resolve => setTimeout(resolve, delay));
      const { data: current } = await auth.auth.getSession();
      if (current.session?.user.id !== data.session.user.id) return;
      access = await call("library");
    }
  }
  subscribe.hidden = access.member;
  status.textContent = access.member
    ? "Your membership includes all six introductory courses."
    : returned ? "Your available courses are shown below. Pending payments unlock automatically once cleared."
    : "Choose a course or subscribe to access all six.";
  renderCourses();
}

async function start() {
  const response = await fetch("member-catalog.json");
  if (!response.ok) throw new Error("The course catalog is temporarily unavailable.");
  catalog = await response.json();
  renderCourses();
  if (!projectUrl || !publishableKey) return;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
  auth = createClient(projectUrl, publishableKey);
  form.addEventListener("submit", event => {
    event.preventDefault();
    perform(form.querySelector("button"), async () => {
      const { error } = await auth.auth.signInWithOtp({
        email: form.elements.email.value,
        options: { emailRedirectTo: new URL("/learning.html", location.origin).href },
      });
      if (error) throw error;
      status.textContent = "Check your email for the sign-in link.";
    });
  });
  subscribe.addEventListener("click", () => perform(subscribe, () => purchase({ offer: "membership" })));
  billing.addEventListener("click", () => perform(billing, async () => {
    const result = await call("portal");
    window.location.assign(result.url);
  }));
  const signout = section.querySelector("[data-member-signout]");
  signout.addEventListener("click", () => perform(signout, async () => {
    const { error } = await auth.auth.signOut();
    if (error) throw error;
    await loadAccount();
  }));
  await loadAccount();
}

start().catch(error => { status.textContent = error.message || "The course library is temporarily unavailable."; });
