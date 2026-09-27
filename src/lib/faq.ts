/**
 * FAQ content (UX plan §11 / §1.4, R8) — bilingual, shopkeeper-plain.
 * Kept out of the page so the searchable list and tests share one source.
 */
export interface FaqEntry {
  id: string;
  q: string;
  a: string;
  qBn: string;
  aBn: string;
}

export const FAQS: FaqEntry[] = [
  {
    id: "speed",
    q: "How fast is delivery?",
    a: "Inside our service area we target 45–50 minutes from order confirmation to your door. The exact estimate depends on your zone, current courier capacity and distance — and is always shown before you place the order.",
    qBn: "ডেলিভারি কত দ্রুত?",
    aBn: "আমাদের সার্ভিস এলাকার ভেতরে অর্ডার কনফার্ম হওয়ার ৪৫–৫০ মিনিটের মধ্যে দরজায় পৌঁছানোর লক্ষ্য রাখি। সঠিক সময়টা আপনার এলাকা, রাইডারের চাপ আর দূরত্বের ওপর নির্ভর করে — অর্ডার দেওয়ার আগেই সেটা দেখতে পাবেন।",
  },
  {
    id: "areas",
    q: "Which areas do you deliver to?",
    a: "We launch inside a deliberately small service area and publish exact zones on the Delivery page and at checkout. As our operation reliably holds the delivery target, we expand zone by zone.",
    qBn: "কোন কোন এলাকায় ডেলিভারি দেন?",
    aBn: "ইচ্ছা করেই ছোট একটা এলাকা দিয়ে শুরু করেছি; কোন কোন এলাকা, তা ডেলিভারি পেজে আর চেকআউটে পরিষ্কার লেখা আছে। সময়মতো পৌঁছানোর কথা ধরে রাখতে পারলে এলাকা ধরে ধরে বাড়াব।",
  },
  {
    id: "payment",
    q: "What payment methods are available?",
    a: "Cash on Delivery is the primary option at launch — you pay when your order arrives. bKash, Nagad and card payments will be added through a payment gateway in a later phase.",
    qBn: "পেমেন্ট কীভাবে করব?",
    aBn: "শুরুতে ক্যাশ অন ডেলিভারিই মূল উপায় — পণ্য হাতে পেয়ে টাকা দেবেন। bKash, Nagad আর কার্ড পেমেন্ট গেটওয়ে চালু হলে পরে যোগ হবে।",
  },
  {
    id: "account",
    q: "Do I need an account to order?",
    a: "No. Checkout works without an account. You can also track any order with just your order ID and phone number.",
    qBn: "অর্ডার করতে অ্যাকাউন্ট লাগবে?",
    aBn: "না। অ্যাকাউন্ট ছাড়াই চেকআউট হয়। অর্ডার আইডি আর ফোন নম্বর দিয়েই যেকোনো অর্ডার ট্র্যাক করতে পারবেন।",
  },
  {
    id: "track",
    q: "How do I track my order?",
    a: "Visit the Track page and enter the order ID from your confirmation message plus your phone number. You will see the live timeline: order placed → confirmed → picked up by the rider → delivered.",
    qBn: "অর্ডার ট্র্যাক করব কীভাবে?",
    aBn: "ট্র্যাক পেজে গিয়ে কনফার্মেশন মেসেজের অর্ডার আইডি আর আপনার ফোন নম্বর দিন। লাইভ টাইমলাইন দেখবেন: অর্ডার হয়েছে → কনফার্ম → রাইডার নিয়েছে → পৌঁছে গেছে।",
  },
  {
    id: "returns",
    q: "What is your return and exchange policy?",
    a: "Unworn items with original tags can be returned or exchanged within 7 days of delivery. Some items, such as innerwear and items marked final sale, are excluded. See the Returns & Exchange page for details.",
    qBn: "রিটার্ন ও বদলের নিয়ম কী?",
    aBn: "ট্যাগসহ, না-পরা পণ্য ডেলিভারির ৭ দিনের মধ্যে ফেরত বা বদল করা যায়। ইনারওয়্যার আর \"ফাইনাল সেল\" চিহ্নিত পণ্য এর বাইরে। বিস্তারিত রিটার্ন ও বদল পেজে।",
  },
  {
    id: "quality",
    q: "How do you keep quality trustworthy?",
    a: "Every product is quality-checked before dispatch, descriptions state real fabric and fit details, and prices include VAT. If something is not right, our support team makes it right.",
    qBn: "মানের ভরসা কীভাবে দেন?",
    aBn: "পাঠানোর আগে প্রতিটি পণ্য চেক করা হয়, বর্ণনায় আসল কাপড় আর ফিটের কথা লেখা থাকে, দামে ভ্যাট ধরা। কিছু ঠিক না লাগলে আমাদের সাপোর্ট টিম ঠিক করে দেয়।",
  },
  {
    id: "beyond",
    q: "Will PROSANTI sell more than clothing?",
    a: "Yes — the platform is designed to grow beyond its first category into lifestyle, home and other products over time, without rebuilding the store.",
    qBn: "PROSANTI কি পোশাকের বাইরেও বিক্রি করবে?",
    aBn: "হ্যাঁ — প্ল্যাটফর্মটা এমনভাবে বানানো যাতে প্রথম ক্যাটাগরির পর লাইফস্টাইল, ঘরের জিনিস ও অন্যান্য পণ্যে বাড়ানো যায়, দোকান নতুন করে না বানিয়ে।",
  },
];
