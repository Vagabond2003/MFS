/**
 * Server messages that embed values (amounts, names, IDs). Matched as patterns
 * when no exact entry exists; captured values are translated when they have
 * an entry of their own (e.g. "Send Money" → "সেন্ড মানি").
 *
 * Order matters: the first pattern that matches wins, so keep the most
 * specific patterns first and very general ones ("{x} bill") at the end.
 */
export const patterns: Record<string, string> = {
  /* ── Notifications: transaction bodies ── */
  "{type} of {amount} to {name} failed{reason}. No money was deducted.": "{name}-কে {amount} {type} ব্যর্থ হয়েছে{reason}। কোনো টাকা কাটা হয়নি।",
  "Float top-up of {amount} is being processed. {ref}": "{amount} ফ্লোট টপ-আপ প্রক্রিয়াধীন আছে। {ref}",
  "Float top-up of {amount} was credited to your e-money balance. {ref}": "{amount} ফ্লোট টপ-আপ আপনার ই-মানি ব্যালেন্সে জমা হয়েছে। {ref}",
  "Settlement of {amount} to {destination} is being processed. {ref}": "{destination}-এ {amount} সেটেলমেন্ট প্রক্রিয়াধীন আছে। {ref}",
  "Settlement of {amount} to {destination} was completed. {ref}": "{destination}-এ {amount} সেটেলমেন্ট সম্পন্ন হয়েছে। {ref}",
  "You received {amount} from {name}. {ref}": "আপনি {name} থেকে {amount} পেয়েছেন। {ref}",
  "{amount} was added to your wallet by {name}. {ref}": "{name} আপনার ওয়ালেটে {amount} যোগ করেছেন। {ref}",
  "{amount} from {name} is clearing and will be available shortly. {ref}": "{name} থেকে {amount} প্রক্রিয়াধীন, শিগগিরই পাওয়া যাবে। {ref}",
  "{amount} was added from {name}. {ref}": "{name} থেকে {amount} যোগ হয়েছে। {ref}",
  "{name} refunded {amount}. {ref}": "{name} {amount} রিফান্ড করেছেন। {ref}",
  "{amount} received from {name} via QR. {ref}": "QR-এর মাধ্যমে {name} থেকে {amount} পাওয়া গেছে। {ref}",
  "{amount} received from {name}. {ref}": "{name} থেকে {amount} পাওয়া গেছে। {ref}",
  "Paid {amount} cash to {name}. You earned {commission} commission. {ref}": "{name}-কে {amount} নগদ দেওয়া হয়েছে। আপনি {commission} কমিশন পেয়েছেন। {ref}",
  "You sent {amount} to {name}. Fee {fee}. {ref}": "আপনি {name}-কে {amount} পাঠিয়েছেন। ফি {fee}। {ref}",
  "Cash In of {amount} to {name}. You earned {commission} commission. {ref}": "{name}-কে {amount} ক্যাশ ইন। আপনি {commission} কমিশন পেয়েছেন। {ref}",
  "You refunded {amount} to {name}. {ref}": "আপনি {name}-কে {amount} রিফান্ড করেছেন। {ref}",
  "{type} of {amount} to {name}. {ref}": "{name}-কে {amount} {type}। {ref}",

  /* ── Notifications: account & disputes ── */
  "Your agent application ({code}) was received. We'll notify you when the review is complete.": "আপনার এজেন্ট আবেদন ({code}) পাওয়া গেছে। পর্যালোচনা শেষ হলে আপনাকে জানানো হবে।",
  "Merchant ID {id} is reserved for {business}. Payments will be enabled after verification.": "{business}-এর জন্য মার্চেন্ট আইডি {id} সংরক্ষিত। ভেরিফিকেশনের পর পেমেন্ট চালু হবে।",
  "Your account was suspended: {reason}. Contact support for help.": "আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে: {reason}। সাহায্যের জন্য সাপোর্টে যোগাযোগ করুন।",
  "We're looking into {trx}. You'll be notified when there's an update.": "আমরা {trx} খতিয়ে দেখছি। কোনো আপডেট হলে আপনাকে জানানো হবে।",
  "Your dispute on {trx} is now {status}.": "{trx}-এর উপর আপনার অভিযোগ এখন {status}।",

  /* ── Errors with values ── */
  "Too many attempts. Try again in {n} minute{s}.": "অনেকবার চেষ্টা হয়েছে। {n} মিনিট পর আবার চেষ্টা করুন।",
  "Incorrect code. {n} attempt{s} left.": "কোড ভুল। আর {n} বার চেষ্টা করতে পারবেন।",
  "Incorrect PIN. {n} attempt{s} left.": "পিন ভুল। আর {n} বার চেষ্টা করতে পারবেন।",
  "{name} is not verified to receive payments yet.": "{name} এখনো পেমেন্ট নেওয়ার জন্য ভেরিফাইড নয়।",
  "{service} is not available for this account type.": "এই ধরনের অ্যাকাউন্টে {service} পাওয়া যায় না।",
  "Your account must be verified before you can use {service}.": "{service} ব্যবহার করতে আপনার অ্যাকাউন্ট ভেরিফাইড হতে হবে।",
  "No agent is registered to {phone}.": "{phone} নম্বরে কোনো এজেন্ট নিবন্ধিত নেই।",
  "No personal Kosh wallet is registered to {phone}.": "{phone} নম্বরে কোনো পার্সোনাল কোষ ওয়ালেট নিবন্ধিত নেই।",
  "Enter a valid {field} (01XXXXXXXXX).": "সঠিক {field} দিন (01XXXXXXXXX)।",
  "Enter a valid {field}.": "সঠিক {field} দিন।",
  "This QR requests exactly {amount}.": "এই QR ঠিক {amount} চায়।",
  "Refunds are allowed within {days} days of payment.": "পেমেন্টের {days} দিনের মধ্যে রিফান্ড করা যায়।",
  "You can refund at most {amount} on this payment.": "এই পেমেন্টে সর্বোচ্চ {amount} রিফান্ড করা যায়।",
  "Insufficient balance. Available: {amount}.": "পর্যাপ্ত ব্যালেন্স নেই। বর্তমান ব্যালেন্স: {amount}।",
  "The per-transaction limit for {kind} accounts is {amount}.": "{kind} অ্যাকাউন্টের প্রতি লেনদেনের লিমিট {amount}।",
  "verified": "ভেরিফাইড",
  "unverified": "ভেরিফাইড নয় এমন",
  "This would exceed the daily limit of {limit}. Remaining today: {left}.": "এতে দৈনিক লিমিট {limit} ছাড়িয়ে যাবে। আজ বাকি আছে: {left}।",
  "Minimum amount is {amount}.": "সর্বনিম্ন পরিমাণ {amount}।",
  "Maximum amount is {amount}.": "সর্বোচ্চ পরিমাণ {amount}।",
  "Minimum amount is ৳{amount}": "সর্বনিম্ন পরিমাণ ৳{amount}",
  "Maximum amount is ৳{amount}": "সর্বোচ্চ পরিমাণ ৳{amount}",
  "Upload the {what}": "{what} আপলোড করুন",
  "You must accept the {what}": "আপনাকে {what} মেনে নিতে হবে",

  /* ── Quote & OTP reasons ── */
  "The customer must approve with the code sent to {phone}.": "গ্রাহককে {phone} নম্বরে পাঠানো কোড দিয়ে অনুমোদন দিতে হবে।",
  "Transactions of {amount} or more need a one-time code.": "{amount} বা তার বেশি লেনদেনে ওয়ান-টাইম কোড লাগে।",
  "Enter the code sent to your {wallet} number {phone} to approve this transfer.": "এই ট্রান্সফার অনুমোদনে আপনার {wallet} নম্বর {phone}-এ পাঠানো কোডটি দিন।",

  /* ── Transaction descriptions ── */
  "Bill payment for customer {phone}": "গ্রাহক {phone}-এর বিল পেমেন্ট",
  "Add Money from {source}": "{source} থেকে অ্যাড মানি",
  "Payment to {name}": "{name}-কে পেমেন্ট",
  "Refund: {reason}": "রিফান্ড: {reason}",

  /* ── General shapes: keep last ── */
  "{type} successful": "{type} সফল হয়েছে",
  // Same messages as above, in the shape the source builds them (kept for the coverage check).
  "Float top-up of {amount} {status}. {ref}": "{amount} ফ্লোট টপ-আপ {status}। {ref}",
  "Settlement of {amount} to {bank} {account} {status}. {ref}": "{bank} {account}-এ {amount} সেটেলমেন্ট {status}। {ref}",
  "{amount} received from {name}{via}. {ref}": "{name} থেকে {amount} পাওয়া গেছে{via}। {ref}",
  "Dispute {status}": "অভিযোগ {status}",
  "{connection} recharge{own}": "{connection} রিচার্জ{own}",
  "{biller} bill": "{biller} বিল",
};
