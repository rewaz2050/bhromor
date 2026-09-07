/**
 * PROSANTI — প্রশান্তি
 * Single source of truth for all site content.
 * Edit here to change copy, retreats, pricing or journal entries.
 */

import type { IconName } from '@/components/Icon';

export const site = {
  name: 'PROSANTI',
  bnName: 'প্রশান্তি',
  tagline: 'Where the mind comes to rest.',
  description:
    'PROSANTI is a small, quiet sanctuary in the tea country of Sylhet — nine rooms, one valley, and nothing scheduled after sunset.',
  location: 'Kamalpur Tea Estate, Sylhet, Bangladesh',
  coordinates: '24.8949° N, 91.8687° E',
  email: 'stay@prosanti.com.bd',
  phone: '+880 1711 004 220',
  whatsapp: '+880 1711 004 220',
  founded: 2019,
  established: 'Est. 2019',
};

/* ─────────────────────────────────────────────────────────
   Hero
   ───────────────────────────────────────────────────────── */

export const hero = {
  eyebrow: 'Nine rooms · One valley · No schedule',
  headline: 'Arrive tired.',
  headlineAccent: 'Leave unhurried.',
  body: 'Set in a working tea garden at the foot of the Khasi hills, PROSANTI is a sanctuary built around a single idea: that silence is not an amenity, it is the point.',
  primaryCta: { label: 'Reserve a stay', href: '/retreats' },
  secondaryCta: { label: 'Walk the grounds', href: '/about' },
  stats: [
    { value: '9', label: 'Rooms only' },
    { value: '42', label: 'Acres of garden' },
    { value: '0', label: 'Televisions' },
    { value: '6', label: 'Years of quiet' },
  ],
};

/* ─────────────────────────────────────────────────────────
   Philosophy
   ───────────────────────────────────────────────────────── */

export const philosophy = {
  label: 'Our philosophy',
  title: 'We removed everything, then kept only what rests you.',
  lede: 'A retreat is not a place with more things to do. It is a place where fewer things are possible.',
  pillars: [
    {
      bn: 'নীরবতা',
      title: 'Silence, by design',
      body: 'No announcements, no piped music, no lobby screens. The only sound after seven is the valley itself — cicadas, rain on the tin roof, the kettle in the hall.',
    },
    {
      bn: 'ছন্দ',
      title: 'A rhythm, not a routine',
      body: 'The day moves with light rather than the clock. Tea at dawn, garden work at eight, long meals, and a dark sky with nothing to compete with it.',
    },
    {
      bn: 'যত্ন',
      title: 'Care from people who stay',
      body: 'Eleven staff, nine rooms. Most have been here since opening, most are from Kamalpur, and all of them know how you take your tea by the second morning.',
    },
  ],
};

/* ─────────────────────────────────────────────────────────
   Experiences / Offerings
   ───────────────────────────────────────────────────────── */

export const experiences: {
  icon: IconName;
  title: string;
  bn: string;
  body: string;
  meta: string;
}[] = [
  {
    icon: 'leaf',
    title: 'Tea garden walks',
    bn: 'চা বাগান',
    body: 'Dawn rounds with the estate pluckers, followed by tasting in the old sorting shed. Six flushes, one hill.',
    meta: 'Daily · 06:15',
  },
  {
    icon: 'water',
    title: 'Spring water bathing',
    bn: 'জলস্নান',
    body: 'Stone tubs fed by a hillside spring, warmed by wood fire and left open to the sky. Booked by the hour, never shared.',
    meta: 'By reservation',
  },
  {
    icon: 'moon',
    title: 'Night sitting',
    bn: 'রাত্রি ধ্যান',
    body: 'Forty minutes of guided stillness on the east deck, then silence. No cushion required, no experience expected.',
    meta: 'Nightly · 20:00',
  },
  {
    icon: 'flame',
    title: 'Kitchen at close',
    bn: 'রান্নাঘর',
    body: 'Sit beside the wood stove while Chef Ruma cooks the evening meal. Ask questions or ask for nothing at all.',
    meta: 'Nightly · 17:30',
  },
  {
    icon: 'hand',
    title: 'Body work',
    bn: 'সেবা',
    body: 'Slow, firm traditional massage with mustard and sesame oil, in a private room with a view of the tea terraces.',
    meta: '50 or 80 min',
  },
  {
    icon: 'book',
    title: 'The reading room',
    bn: 'পাঠকক্ষ',
    body: 'Nine hundred books, two long tables, one window seat. Nobody will tell you when it closes, because it does not.',
    meta: 'Always open',
  },
];

/* ─────────────────────────────────────────────────────────
   Retreats
   ───────────────────────────────────────────────────────── */

export type Retreat = {
  slug: string;
  name: string;
  bn: string;
  tagline: string;
  nights: string;
  priceBdt: number;
  priceUsd: number;
  groupSize: string;
  season: string;
  image: string;
  summary: string;
  body: string[];
  includes: string[];
  cadence: string;
};

export const retreats: Retreat[] = [
  {
    slug: 'the-still-week',
    name: 'The Still Week',
    bn: 'নীরব সপ্তাহ',
    tagline: 'Seven days of very little, on purpose.',
    nights: '7 nights',
    priceBdt: 78000,
    priceUsd: 650,
    groupSize: 'Max 9 guests',
    season: 'October — March',
    image: '/images/retreat-still.jpg',
    summary:
      'Our signature retreat. Devices collected on arrival, three silent meals a day, and a schedule that clears out day by day until nothing is left but weather and company.',
    body: [
      'The Still Week is not a programme so much as a subtraction. The first two days are gently structured — garden work, evening sitting, a long walk to the ridge — because most people arrive too wired to sit still without something to do with their hands.',
      'From day three the structure thins. Meals remain, silence remains, and the valley does the rest. Guests consistently describe days four and five as the longest of their recent lives, in the best sense.',
      'It ends, as everything here does, with tea.',
    ],
    includes: [
      'Seven nights in a garden room',
      'All meals, sourced within 20 km',
      'Dawn tea-garden walk with the estate',
      'Nightly guided sitting on the east deck',
      'One 80-minute body work session',
      'Return transfer from Osmani International (ZYL)',
    ],
    cadence: 'Runs the first Sunday of each month',
  },
  {
    slug: 'monsoon-days',
    name: 'Monsoon Days',
    bn: 'বর্ষা',
    tagline: 'For people who find rain restful.',
    nights: '4 nights',
    priceBdt: 42000,
    priceUsd: 350,
    groupSize: 'Max 9 guests',
    season: 'June — September',
    image: '/images/retreat-monsoon.jpg',
    summary:
      'Sylhet in monsoon is the greenest place on earth and nobody comes. We keep the fire lit, the kitchen busy, and the doors open to the sound of it.',
    body: [
      'The hills take on a different weight in June. Everything is wet, everything is loud, and the reading room becomes the centre of the house for four days.',
      'Days are built around what the weather permits: bread-baking, long lunches, an indoor body work session, and — on the rare dry hour — a walk out to the falls above the estate.',
      'This is the quietest season we have and the one regulars ask for most.',
    ],
    includes: [
      'Four nights in a garden room',
      'All meals plus afternoon tea and cake',
      'Two body work sessions',
      'Bread-baking morning with Chef Ruma',
      'Waterfall walk, weather permitting',
      'Rain gear and gumboots, provided',
    ],
    cadence: 'Every Thursday, June through September',
  },
  {
    slug: 'two-for-the-quiet',
    name: 'Two, for the Quiet',
    bn: 'দুইজন',
    tagline: 'A private house, a private valley.',
    nights: '3 nights',
    priceBdt: 55000,
    priceUsd: 460,
    groupSize: '2 guests',
    season: 'Year round',
    image: '/images/retreat-couple.jpg',
    summary:
      'The whole east wing, the spring bath at any hour, and a cook who will make whatever you liked as a child if you tell her what it was.',
    body: [
      'Built for anniversaries, for grief, for a decision that needs making, or for no reason that needs explaining.',
      'You take the east wing: two rooms, a private deck, the stone bath reserved to you alone for the whole stay. Breakfast arrives whenever you appear.',
      'No programming, no schedule, no other guests in your wing. The staff know to leave the bell alone.',
    ],
    includes: [
      'Three nights, entire east wing',
      'Private spring bath, reserved to you',
      'All meals, cooked to request',
      'One 80-minute body work session each',
      'Late checkout, always',
      'Return transfer from Osmani International (ZYL)',
    ],
    cadence: 'Any arrival, subject to availability',
  },
  {
    slug: 'the-long-weekend',
    name: 'The Long Weekend',
    bn: 'ছোট বিরতি',
    tagline: 'Thursday in, Monday out, nothing missed.',
    nights: '3 nights',
    priceBdt: 31000,
    priceUsd: 260,
    groupSize: 'Max 9 guests',
    season: 'Year round',
    image: '/images/retreat-weekend.jpg',
    summary:
      'The shortest thing we offer and the one most people repeat. Enough time to lose the first two days of tension and get back to Dhaka before anyone notices.',
    body: [
      'Arrive Thursday evening, sit down to dinner, and let Friday be uneventful. Saturday has one thing on it — a garden walk or a body work session, your choice. Sunday is empty.',
      'You leave Monday after breakfast, which is a better time to return to a city than Sunday evening, and nobody can argue with it.',
    ],
    includes: [
      'Three nights in a garden room',
      'All meals plus dawn tea service',
      'One 50-minute body work session',
      'Full use of the reading room and grounds',
      'Airport or bus transfer, either way',
    ],
    cadence: 'Thursdays, year round',
  },
];

/* ─────────────────────────────────────────────────────────
   Journal
   ───────────────────────────────────────────────────────── */

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateLabel: string;
  author: string;
  minutes: number;
  category: string;
  image: string;
  body: string[];
};

export const posts: Post[] = [
  {
    slug: 'on-doing-nothing-well',
    title: 'On doing nothing, well',
    excerpt:
      'Most guests arrive intending to rest and immediately look for the schedule. We have found that the hardest part of a retreat is not the silence — it is permission.',
    date: '2026-08-14',
    dateLabel: '14 August 2026',
    author: 'Nafisa Rahman',
    minutes: 6,
    category: 'Practice',
    image: '/images/journal-nothing.jpg',
    body: [
      'In six years of running PROSANTI we have learned to read an arrival within about ten minutes. There is a particular kind of guest who steps out of the car, takes in the valley, says "beautiful", and then asks what time dinner is.',
      'They are not being rude. They are being honest. Most of us have spent so long optimising our days that an unscheduled one registers as an error rather than a gift.',
      'So we no longer hand out a schedule on the first night. We hand out tea, show you your room, and say that breakfast is between seven and ten, and that beyond that the day is yours.',
      'The first morning is usually difficult. Guests appear at eight, uncertain, holding a book they do not yet want to read. By the third morning the same people are missing lunch entirely because they were watching mist move off the ridge, and they will tell you later that it was the best part of the week.',
      'Doing nothing well is a skill with a learning curve. It takes about two days, and the only thing that speeds it up is not being told what to do.',
    ],
  },
  {
    slug: 'the-flush-calendar',
    title: 'The flush calendar of Kamalpur',
    excerpt:
      'What the estate is doing right now, when to come for which tea, and why the second flush is worth planning a year around.',
    date: '2026-07-02',
    dateLabel: '2 July 2026',
    author: 'Jahangir Chowdhury',
    minutes: 8,
    category: 'The garden',
    image: '/images/journal-tea.jpg',
    body: [
      'Kamalpur picks in flushes, and each one tastes like a different estate. The first flush, in late March, is thin and bright and slightly astringent — the tea of a hill waking up.',
      'The second flush, through May and June, is the one connoisseurs travel for. It carries the muscatel note that people mistake for flavouring and are delighted to learn is not. If you want to taste Kamalpur at its best, come in the last week of May.',
      'Monsoon flush is heavy and quick-growing, and mostly goes to blending. The autumn flush in October is small, sweet and underrated, and it is what we pour in the reading room all winter.',
      'We buy everything we serve from the estate at fair price, which is why the garden walk ends in the sorting shed rather than a gift shop. You will taste the flush you walked through that morning.',
    ],
  },
  {
    slug: 'building-with-what-the-valley-gave',
    title: 'Building with what the valley gave us',
    excerpt:
      'Salvaged teak, local brick, and a roof pitch we got wrong twice. Notes from four years of building nine rooms.',
    date: '2026-05-20',
    dateLabel: '20 May 2026',
    author: 'Nafisa Rahman',
    minutes: 7,
    category: 'The house',
    image: '/images/journal-build.jpg',
    body: [
      'PROSANTI was built slowly and mostly by hand, using timber from demolished houses in Sunamganj and brick fired eleven kilometres away. Nothing here was shipped from Dhaka that could reasonably be made in Sylhet.',
      'The roof pitch took us three attempts. The first was too shallow and the monsoon walked straight through it. The second over-corrected and the rooms felt like the inside of a boat. The third is the one you see, and it was suggested by a carpenter from Kamalpur who had never drawn a plan in his life.',
      'We left the old estate bungalow standing and put the kitchen in it, because it was already the warmest room on the property and we could not improve on that.',
      'The result is a house that looks as though it has been here longer than it has, which was the whole intention.',
    ],
  },
  {
    slug: 'the-falls-above-the-estate',
    title: 'The falls above the estate',
    excerpt:
      'A ninety-minute climb, a pool the colour of weak tea, and the only place on the property where you cannot hear the road. Worth it in monsoon. Marginal in March.',
    date: '2026-06-18',
    dateLabel: '18 June 2026',
    author: 'Jahangir Chowdhury',
    minutes: 5,
    category: 'The garden',
    image: '/images/journal-falls.jpg',
    body: [
      'There is a fall about two kilometres above the upper terrace, on land that belongs to the estate but that nobody has ever had a reason to walk to. We found it in 2018 looking for the source of the spring, and we have been taking guests up ever since.',
      'The climb is ninety minutes at a comfortable pace and steeper than it looks for the last twenty. It is not a hike that requires fitness, but it is not a stroll either, and in the monsoon the last stretch is genuinely slippery. We only go when the ground has had a dry day.',
      'At the top there is a pool about four metres across, fed by water that has come down through leaf litter, which is why it is the colour of weak tea rather than the blue you might expect. It is cold. People who swim in it say very little for several minutes afterwards, which we take as a good sign.',
      'The reason we go is not the swimming. It is that above the ridge the road disappears entirely — no engine, no horns, no distant generator. It is the only place on the property where the silence is total rather than comparative, and for a lot of guests that turns out to be the thing they remember.',
      'We schedule it on Monsoon Days when the weather allows, and on request for other stays. Bring shoes you do not mind ruining.',
    ],
  },
  {
    slug: 'what-happens-in-the-sorting-shed',
    title: 'What happens in the sorting shed',
    excerpt:
      'The 1954 shed at the bottom of the estate still grades every leaf by hand. It is where the garden walk ends, and it is more interesting than the tasting.',
    date: '2026-04-09',
    dateLabel: '9 April 2026',
    author: 'Ruma Begum',
    minutes: 6,
    category: 'The garden',
    image: '/images/journal-shed.jpg',
    body: [
      'Most tea estates we know have mechanised their sorting. Kamalpur has not, mainly because the shed is too old and too narrow to take the machines, and nobody has decided whether that is a problem.',
      'So the grading is still done by hand, on long wooden tables with mesh sieves of descending grade. Leaf goes in at one end and comes out at the other as whole leaf, broken, fannings and dust — four prices, four destinations, and a difference you can taste clearly if you brew them side by side.',
      'We end every garden walk in the shed rather than in a shop, because watching someone grade tea for ten minutes tells you more about the drink than any tasting note does. Guests stop talking after about three minutes. It is very quiet work and it is oddly absorbing.',
      'The tea we pour at PROSANTI is whole leaf only, bought from the estate at an agreed premium. The dust does not get thrown away; it goes to the staff canteen, where it is brewed strong and sweet with milk and cardamom, which is the correct way to drink it.',
    ],
  },
];

/* ─────────────────────────────────────────────────────────
   Testimonials
   ───────────────────────────────────────────────────────── */

export const testimonials = [
  {
    quote:
      'I have stayed in expensive quiet places before. This is the first one where the quiet felt like the offering rather than a gap in the service.',
    name: 'Tasnim A.',
    role: 'Dhaka · The Still Week',
  },
  {
    quote:
      'Four days of rain, one book, and the sound of the tin roof. I went back to work on Monday and my colleagues thought I had been away a month.',
    name: 'Raihan K.',
    role: 'Chattogram · Monsoon Days',
  },
  {
    quote:
      'We came for our tenth anniversary and asked for nothing in advance. Ruma made my grandmother’s bhuna khichuri anyway, because I mentioned it once.',
    name: 'Farhana & Shahed',
    role: 'Sylhet · Two, for the Quiet',
  },
];

/* ─────────────────────────────────────────────────────────
   Practical
   ───────────────────────────────────────────────────────── */

export const practical = [
  {
    q: 'How do I get there?',
    a: 'Sylhet Osmani International (ZYL) is 55 minutes by road. We collect you. From Dhaka, the overnight train to Sylhet arrives at 07:40 and we meet it.',
  },
  {
    q: 'Is there wifi?',
    a: 'Yes, in the reading room only, and it is not fast. Rooms have no screens of any kind. We collect phones on the Still Week; other retreats are your call.',
  },
  {
    q: 'What about food?',
    a: 'Three meals a day, Bengali, vegetarian by default with fish or chicken on request. Everything is cooked in the old bungalow kitchen and most of it comes from within twenty kilometres.',
  },
  {
    q: 'Can I come alone?',
    a: 'Roughly half our guests do, and they are the easiest to host. Single occupancy costs nothing extra outside December.',
  },
  {
    q: 'Children?',
    a: 'Welcome on Two, for the Quiet and Monsoon Days. The Still Week is for adults, because the silence is the whole point of it.',
  },
  {
    q: 'What is your cancellation policy?',
    a: 'Full refund up to 14 days before arrival, half up to 7 days, and we will always rebook you rather than take the money if you can.',
  },
];

export const marqueeWords = [
  'প্রশান্তি',
  'silence',
  'tea at dawn',
  'no schedule',
  'nine rooms',
  'one valley',
  'rain on tin',
  'unhurried',
];

/* ─────────────────────────────────────────────────────────
   The grounds — photo grid
   ───────────────────────────────────────────────────────── */

/**
 * `grid` holds literal Tailwind placement classes. They are intentionally
 * inline strings so Tailwind's scanner (which includes lib/**) can see them.
 * The five tiles fill a 12-column grid as: 7+5 / 7+5 / 4+8.
 */
export const gallery = [
  {
    src: '/images/gallery-mist.jpg',
    alt: 'Morning mist rolling over the ridge, seen from the veranda',
    caption: 'The ridge at six, most mornings of the year.',
    grid: 'lg:col-span-7 lg:row-span-2',
  },
  {
    src: '/images/gallery-trail.jpg',
    alt: 'A worn footpath winding between rows of tea bushes',
    caption: 'The path down to the sorting shed.',
    grid: 'lg:col-span-5',
  },
  {
    src: '/images/gallery-dining.jpg',
    alt: 'The long communal table set for dinner by candlelight',
    caption: 'One table, one seating, whatever the kitchen made.',
    grid: 'lg:col-span-5',
  },
  {
    src: '/images/gallery-room.jpg',
    alt: 'A garden room with shutters open onto the tea terraces',
    caption: 'No screen, no clock, one window.',
    grid: 'lg:col-span-4',
  },
  {
    src: '/images/gallery-night.jpg',
    alt: 'The Milky Way above the dark silhouette of the hills',
    caption: 'The nearest streetlight is four kilometres away.',
    grid: 'lg:col-span-8',
  },
];

export const faq = practical;
