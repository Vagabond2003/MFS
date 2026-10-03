/**
 * Merchant & agent insights: fixed wording used when no AI model answers
 * (src/server/ai/kinds.ts), plus the insight screens.
 */
export const ai: Record<string, string> = {
  /* ── Shared labels ── */
  "Sunday": "রবিবার",
  "Monday": "সোমবার",
  "Tuesday": "মঙ্গলবার",
  "Wednesday": "বুধবার",
  "Thursday": "বৃহস্পতিবার",
  "Friday": "শুক্রবার",
  "Saturday": "শনিবার",
  "Dhaka": "ঢাকা",
  "Chattogram": "চট্টগ্রাম",
  "Gazipur": "গাজীপুর",
  "Narayanganj": "নারায়ণগঞ্জ",
  "Sylhet": "সিলেট",
  "Rajshahi": "রাজশাহী",
  "Khulna": "খুলনা",
  "Cumilla": "কুমিল্লা",
  "Business profile not found.": "ব্যবসার প্রোফাইল পাওয়া যায়নি।",

  /* ── Agent: liquidity ── */
  "cash": "নগদ টাকা",
  "e-money float": "ই-মানি ফ্লোট",
  "Your {kind} may run short on {date}: you'd start the day with {opening}, but a busy day could need {demand}.":
    "{date} তারিখে আপনার {kind} কম পড়তে পারে: দিনের শুরুতে থাকবে {opening}, কিন্তু ব্যস্ত দিনে লাগতে পারে {demand}।",
  "Cash and e-money float look sufficient for the next 7 days. Expected cash-outs: {cashOut}; cash-ins: {cashIn}.":
    "আগামী ৭ দিনের জন্য নগদ টাকা ও ই-মানি ফ্লোট যথেষ্ট মনে হচ্ছে। সম্ভাব্য ক্যাশ আউট: {cashOut}; ক্যাশ ইন: {cashIn}।",
  "Top up your e-money float by {amount} before {date}.": "{date} তারিখের আগে ই-মানি ফ্লোট {amount} বাড়িয়ে নিন।",
  "Bring {amount} more cash to the counter before {date}.": "{date} তারিখের আগে কাউন্টারে আরও {amount} নগদ টাকা রাখুন।",
  "You could settle {amount} of surplus e-money to your bank.": "অতিরিক্ত {amount} ই-মানি আপনার ব্যাংকে সেটেল করতে পারেন।",

  /* ── Agent: performance ── */
  "Your volume over the last 28 days was {volume}, with {commission} earned in commission.":
    "গত ২৮ দিনে আপনার লেনদেন {volume}, কমিশন আয় {commission}।",
  "Your volume over the last 28 days was {volume}, up {pct}% on the 28 days before, with {commission} earned in commission.":
    "গত ২৮ দিনে আপনার লেনদেন {volume}, যা আগের ২৮ দিনের চেয়ে {pct}% বেশি; কমিশন আয় {commission}।",
  "Your volume over the last 28 days was {volume}, down {pct}% on the 28 days before, with {commission} earned in commission.":
    "গত ২৮ দিনে আপনার লেনদেন {volume}, যা আগের ২৮ দিনের চেয়ে {pct}% কম; কমিশন আয় {commission}।",
  "You're ahead of {rank}% of agents.": "আপনি {rank}% এজেন্টের চেয়ে এগিয়ে আছেন।",
  "You're ahead of {rank}% of agents in your district.": "আপনার জেলার {rank}% এজেন্টের চেয়ে আপনি এগিয়ে আছেন।",
  "{n} of the last 30 days ended with very little cash — keep more cash at the counter.":
    "গত ৩০ দিনের মধ্যে {n} দিন শেষে হাতে খুব কম নগদ ছিল — কাউন্টারে আরও নগদ টাকা রাখুন।",

  /* ── Merchant: demand & benchmark ── */
  "Expect about {value} in sales over the next 7 days (likely {low} to {high}).":
    "আগামী ৭ দিনে প্রায় {value} বিক্রি হতে পারে (সম্ভবত {low} থেকে {high})।",
  "{day} is usually your busiest day.": "সাধারণত {day} আপনার সবচেয়ে ব্যস্ত দিন।",
  "Your busiest hours are {hours}.": "আপনার সবচেয়ে ব্যস্ত সময় {hours}।",
  "sales (30 days)": "বিক্রি (৩০ দিন)",
  "average payment": "গড় পেমেন্ট",
  "repeat customers": "নিয়মিত গ্রাহক",
  "QR payments": "QR পেমেন্ট",
  "failed payments": "ব্যর্থ পেমেন্ট",
  "There aren't enough similar merchants yet for a comparison.": "তুলনা করার মতো যথেষ্ট একই ধরনের মার্চেন্ট এখনও নেই।",
  "Compared with {n} similar merchants, your {metric} is ahead of {pct}% of them.":
    "একই ধরনের {n}টি মার্চেন্টের সাথে তুলনায় আপনার {metric} তাদের {pct}% এর চেয়ে এগিয়ে।",
  "The area to improve is {metric}: {yours} against a typical {median}.": "উন্নতির জায়গা হলো {metric}: আপনার {yours}, সাধারণত {median}।",

  /* ── Merchant: recommendations ── */
  "Win back regular customers": "নিয়মিত গ্রাহকদের ফিরিয়ে আনুন",
  "Payments fell to {now} in the last 14 days from {before} in the 14 days before. Reach out to regulars with a small offer.":
    "গত ১৪ দিনে পেমেন্ট কমে {now}টি হয়েছে, আগের ১৪ দিনে ছিল {before}টি। নিয়মিত গ্রাহকদের একটি ছোট অফার দিন।",
  "Cut failed payments": "ব্যর্থ পেমেন্ট কমান",
  "{rate} of payment attempts failed, against {median} for similar merchants. Check the QR display and the network at your counter.":
    "{rate} পেমেন্ট চেষ্টা ব্যর্থ হয়েছে, একই ধরনের মার্চেন্টদের ক্ষেত্রে যা {median}। কাউন্টারের QR কোড ও নেটওয়ার্ক পরীক্ষা করুন।",
  "Get ready for salary days": "বেতনের দিনগুলোর জন্য প্রস্তুত থাকুন",
  "Sales usually rise about {rise} on days 1–5 of the month. Expect busier days from {from} to {to} — stock up and plan extra staff.":
    "মাসের ১–৫ তারিখে বিক্রি সাধারণত প্রায় {rise} বাড়ে। {from} থেকে {to} পর্যন্ত বেশি ব্যস্ততা আশা করুন — আগে থেকে মাল মজুত করুন ও বাড়তি লোক রাখুন।",
  "Prepare for {day}": "{day}-এর জন্য প্রস্তুত থাকুন",
  "{day}, {date} looks like your busiest day this week, with about {amount} in expected sales.":
    "{day}, {date} এই সপ্তাহে আপনার সবচেয়ে ব্যস্ত দিন হতে পারে, সম্ভাব্য বিক্রি প্রায় {amount}।",
  "Promote QR payments": "QR পেমেন্টে উৎসাহ দিন",
  "{yours} of your payments use QR, against {median} for similar merchants. Display your QR code where customers pay.":
    "আপনার {yours} পেমেন্ট QR-এ হয়, একই ধরনের মার্চেন্টদের ক্ষেত্রে যা {median}। যেখানে গ্রাহক টাকা দেন সেখানে QR কোড রাখুন।",
  "Bring customers back": "গ্রাহকদের আবার ফিরিয়ে আনুন",
  "{yours} of your customers paid more than once this month, against {median} for similar merchants. Try a small reward for repeat visits.":
    "এই মাসে আপনার {yours} গ্রাহক একাধিকবার পেমেন্ট করেছেন, একই ধরনের মার্চেন্টদের ক্ষেত্রে যা {median}। বারবার আসা গ্রাহকদের জন্য ছোট পুরস্কার দিন।",
  "Staff up at peak hours": "ব্যস্ত সময়ে লোক বাড়ান",
  "Most payments come in at {hours}. Make sure the counter is staffed then.": "বেশিরভাগ পেমেন্ট আসে {hours} সময়ে। তখন কাউন্টারে লোক থাকা নিশ্চিত করুন।",

  /* ── Admin ── */
  "no recent payments": "সম্প্রতি কোনো পেমেন্ট নেই",
  "fewer payments": "পেমেন্ট কমে যাওয়া",
  "lower sales value": "বিক্রির পরিমাণ কমে যাওয়া",
  "refunds": "রিফান্ড",
  "{high} of {n} merchants are at high churn risk and {medium} at medium risk.":
    "{n}টি মার্চেন্টের মধ্যে {high}টি উচ্চ ঝুঁকিতে এবং {medium}টি মাঝারি ঝুঁকিতে আছে যে তারা Kosh ব্যবহার ছেড়ে দিতে পারে।",
  "The most common reason is {reason}.": "সবচেয়ে সাধারণ কারণ: {reason}।",
  "{flagged} of {n} agents show unusual patterns to review, {rising} are rising performers and {gaps} have service gaps.":
    "{n} জন এজেন্টের মধ্যে {flagged} জনের লেনদেনে অস্বাভাবিক ধরন দেখা যাচ্ছে, {rising} জন দ্রুত এগোচ্ছেন এবং {gaps} জনের সেবায় ঘাটতি আছে।",
  "No district data yet. Add districts to agents and merchants to see coverage.":
    "এখনও জেলার তথ্য নেই। কভারেজ দেখতে এজেন্ট ও মার্চেন্টদের জেলা যোগ করুন।",
  "{district} is the most underserved district: {perAgent} customers per agent against a network median of {median}. About {agents} more agents would bring it to the median.":
    "{district} সবচেয়ে কম সেবা পাওয়া জেলা: প্রতি এজেন্টে {perAgent} জন গ্রাহক, যেখানে নেটওয়ার্কের মধ্যমা {median}। মধ্যমায় আনতে আরও প্রায় {agents} জন এজেন্ট দরকার।",
};
