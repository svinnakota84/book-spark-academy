const items = {
  "practical-ai-for-everyday-work": [
    ["What should a prompt include before asking for a workplace update?",["A guess about the deadline","Verified notes and the intended audience","Only the word ‘summarize’"],1],
    ["The notes call Friday a target. What should the draft call it?",["A target pending review","A guarantee","A missed deadline"],0],
    ["How should you handle a missing date?",["Use today’s date","Choose the next Friday","Flag the missing date for review"],2],
    ["What is the best check before sending the draft?",["Compare it with the source notes","Count its paragraphs","Ask for more confident wording"],0],
    ["The reviewer still needs to check two totals. What should the update say?",["The totals are approved","The review is still pending","The report has not been drafted"],1],
  ],
  "from-idea-to-business-model": [
    ["Which buyer is best defined for a first test?",["Everyone online","Any business with a website","Local furniture showroom managers"],2],
    ["Which result gives stronger evidence of demand?",["Two prospects request a paid pilot quote","Five prospects say the idea sounds good","A social post gets views"],0],
    ["When should you set the test’s success threshold?",["After seeing results","Before running the test","After launching the product"],1],
    ["What should a testable offer name?",["Only a technology","A brand name and colors","A buyer, problem, and deliverable"],2],
    ["Nobody requests a quote. What should you do next?",["Ask what prevented a purchase","Assume the price was accepted","Count compliments as orders"],0],
  ],
  "navigate-the-news-with-confidence": [
    ["What is the best primary source for a city council vote?",["A comment thread","Official council minutes","A reposted headline"],1],
    ["Three outlets repeat the same wire report. How many independent reports does that establish?",["One original report","Three independent reports","Four independent reports"],0],
    ["The city approved money for park design. What does that establish?",["The park opened","Construction is finished","Design funding was approved"],2],
    ["What should you check when a publisher corrects a story?",["Which version supports the claim","Only its social share count","Only the image caption"],0],
    ["What does a useful fact check identify first?",["The writer’s preferred headline style","The specific claim, actor, and event","The number of ads on the page"],1],
  ],
  "automation-for-small-business": [
    ["Which best describes a workflow trigger?",["The person who buys it","The price of a tool","The event that starts the workflow"],2],
    ["What should a duplicate request do?",["Update the existing ticket where applicable","Always create a second ticket","Delete the original request"],0],
    ["What should happen when a customer asks for a refund outside the policy?",["Approve it automatically","Send it for human review","Ignore the customer"],1],
    ["What helps recover after a temporary service outage?",["Retry using the same ticket identifier","Retry with a fresh ticket each time","Discard the record"],0],
    ["What should you test before counting on an automated quote workflow?",["The font alone","Only a complete request","Complete, missing-information, and duplicate requests"],2],
  ],
  "understand-business-headlines": [
    ["Which measure tracks cash moving in and out?",["Cash flow","Revenue","Operating margin"],0],
    ["Operating profit is 18 and revenue is 120. What is operating margin?",["18%","15%","20%"],1],
    ["Revenue rose from 100 to 120. By what percentage did it rise?",["10%","15%","20%"],2],
    ["Profit fell from 20 to 18. What can you conclude?",["It fell 10%","Revenue also fell","Cash flow rose"],0],
    ["What helps make a fair period comparison?",["Different currencies without conversion","Comparable periods, units, and definitions","Only comparing headline adjectives"],1],
  ],
  "data-literacy-for-curious-minds": [
    ["A store received 12 complaints on 400 orders. What was the rate?",["12%","3%","30%"],1],
    ["What can a truncated vertical axis do?",["Change the underlying values","Remove the denominator","Make a small change look large"],2],
    ["Signups rose from 20 to 30 while visits rose from 200 to 500. What happened to the signup rate?",["It fell from 10% to 6%","It rose from 6% to 10%","It stayed at 10%"],0],
    ["How large is the change from 10% to 6% in percentage points?",["40 percentage points","4 percentage points","6 percentage points"],1],
    ["What must you know to compare complaint rates?",["The color of each bar","Which store opened first","The order totals behind the counts"],2],
  ],
};
export function questionsFor(slug) {
  return items[slug]?.map(([prompt, choices]) => ({ prompt, choices }));
}
export function grade(slug, answers) {
  const questions = items[slug];
  if (!questions || !Array.isArray(answers) || answers.length !== questions.length ||
      !answers.every((answer, index) => Number.isInteger(answer) && answer >= 0 && answer < questions[index][1].length)) return null;
  const score = questions.filter((question, i) => question[2] === answers[i]).length;
  return { score, total: questions.length, passed: score * 5 >= questions.length * 4 };
}
