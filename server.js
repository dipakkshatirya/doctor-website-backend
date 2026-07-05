require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---- Your clinic's real facts, in one place ----
const CLINIC_INFO = {
  clinicName: "Dr. Aarav Sharma's Orthopedic Clinic",
  doctorName: "Dr. Aarav Sharma",
  specialty: "Orthopedic Surgeon",
  experience: "20 years",
  patientsCount: "45,000+",
  googleRating: "4.8",
  clinicAddress:
    "302, Shree Avenue Complex, Satellite Road, Near Shivranjani Crossroads, Ahmedabad, Gujarat 380015",
  phone: "+91 92651 39142",
  email: "DrAaravSharma@business.com",
  hours: "Mon–Sat, 10:00 AM – 7:00 PM",
  about:
    "Dr. Aarav Sharma is a dedicated orthopedic surgeon specializing in joint replacement, sports medicine, spine care, hand and wrist surgery, foot and ankle disorders, and trauma management. He is committed to delivering advanced, personalized treatment that helps patients recover mobility, relieve pain, and return to an active lifestyle.",
  specialties: [
    "Joint Replacement — surgical treatment for damaged hip, knee, and shoulder joints",
    "Sports Medicine — ligament tears, ACL injuries, meniscus damage, tendon problems, muscle strains",
    "Hand & Wrist — fractures, carpal tunnel syndrome, tendon injuries, arthritis",
    "Foot & Ankle — sprains, heel pain, fractures, bunions, tendon disorders",
    "Spine Care — back pain, slipped discs, sciatica, spinal deformities, degenerative disorders",
    "Trauma & Fractures — emergency care for fractures, accident injuries, complex bone trauma, dislocations",
  ],
  conditionsTreated: [
    "Knee Arthritis", "Hip Arthritis", "Joint Replacement", "Sports Injuries",
    "ACL Tear", "Meniscus Injury", "Shoulder Dislocation", "Rotator Cuff Injury",
    "Carpal Tunnel Syndrome", "Hand & Wrist Fractures", "Foot & Ankle Pain",
    "Ankle Ligament Injury", "Heel Pain", "Plantar Fasciitis", "Back Pain",
    "Neck Pain", "Slipped Disc", "Sciatica", "Spinal Disorders",
    "Bone Fractures", "Trauma Care", "Post-Fracture Rehabilitation",
  ],
  testimonials: [
    { name: "Rahul Verma", text: "After suffering from a severe ankle ligament injury, I received excellent treatment and rehabilitation guidance. The recovery was much faster than I expected, and I'm back to my normal routine without pain." },
    { name: "Pooja Sharma", text: "I had a wrist fracture after a bike accident. Dr. Aarav Sharma explained every step of the treatment and ensured a smooth recovery. My hand movement is now completely normal." },
    { name: "Aisha Khan", text: "For months I struggled with severe back pain due to a spine problem. Dr. Aarav Sharma recommended the right treatment without unnecessary surgery. Today I can work and travel comfortably again." },
    { name: "Rohit Desai", text: "I consulted Dr. Aarav Sharma for chronic shoulder pain. His diagnosis was accurate, and the physiotherapy plan worked wonderfully. I regained full shoulder movement within a few weeks." },
    { name: "Jatin Mehta", text: "Following a football injury, I suffered an ACL tear. Dr. Aarav Sharma performed the surgery successfully and guided me throughout rehabilitation. I'm back on the field with complete confidence." },
    { name: "Neha Patel", text: "I underwent knee replacement surgery under Dr. Aarav Sharma. The entire process—from consultation to recovery—was handled professionally. My knee pain has completely gone, and I can walk comfortably again." },
  ],
};

// ---- Tiny fuzzy matcher so typos don't slip through ----
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Fuzzy word match with two safeguards against false positives:
// 1. Very short keywords (<=3 letters) require an EXACT match — fuzzy
//    tolerance on tiny words causes too many accidental collisions
//    (e.g. "who" matching "how"/"you").
// 2. For longer keywords, a word can only fuzzy-match if its length is
//    close to the keyword's length — this stops unrelated short words
//    like "your"/"yours" from matching a longer keyword like "hours"
//    just because the edit distance happens to be small.
function fuzzyIncludes(text, keyword) {
  const words = text.split(/\W+/).filter(Boolean);

  if (keyword.length <= 3) {
    return words.some((w) => w === keyword);
  }

  const maxDistance = keyword.length <= 4 ? 1 : Math.ceil(keyword.length / 3);
  return words.some((w) => {
    if (Math.abs(w.length - keyword.length) > 1) return false;
    return levenshtein(w, keyword) <= maxDistance;
  });
}

function matchesAny(text, keywords) {
  return keywords.some((k) => fuzzyIncludes(text, k));
}

// ---- Helper: pick 3 random testimonials so replies don't feel repetitive ----
function pickTestimonials(count = 3) {
  const shuffled = [...CLINIC_INFO.testimonials].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ---- Instant, hardcoded answers for the most common questions ----
const INTENTS = [
  {
    keywords: ["phone", "number", "call", "contact", "mobile", "whatsapp"],
    reply: () => `You can reach ${CLINIC_INFO.doctorName}'s clinic at **${CLINIC_INFO.phone}**.`,
  },
  {
    keywords: ["address", "location", "located", "directions", "where"],
    reply: () => `The clinic is located at **${CLINIC_INFO.clinicAddress}**.`,
  },
  {
    keywords: ["book", "appointment", "appt", "schedule", "slot", "consult"],
    reply: () =>
      `You can book an appointment by calling **${CLINIC_INFO.phone}** ` +
      `or emailing **${CLINIC_INFO.email}**.\n` +
      `Clinic hours: **${CLINIC_INFO.hours}**.`,
  },
  {
    keywords: ["timing", "hours", "open", "close", "working", "time"],
    reply: () => `The clinic is open **${CLINIC_INFO.hours}**.`,
  },
  {
    keywords: ["email", "mail"],
    reply: () => `You can email the clinic at **${CLINIC_INFO.email}**.`,
  },
  {
    keywords: ["rating", "review", "reviews", "testimonial", "feedback", "star", "stars"],
    reply: () => {
      const picks = pickTestimonials(3);
      const quotes = picks
        .map((t) => `- "${t.text}" — **${t.name}**`)
        .join("\n");
      return (
        `${CLINIC_INFO.doctorName} has a **${CLINIC_INFO.googleRating}-star** rating on Google, ` +
        `based on care for **${CLINIC_INFO.patientsCount} patients** over **${CLINIC_INFO.experience}**.\n\n` +
        `Here's what a few patients have said:\n${quotes}`
      );
    },
  },
  {
    keywords: ["specialties", "specialty", "specialize", "treat", "services", "conditions"],
    reply: () =>
      `${CLINIC_INFO.doctorName} specializes in:\n` +
      CLINIC_INFO.specialties.map((s) => `- **${s.split(" — ")[0]}**: ${s.split(" — ")[1]}`).join("\n"),
  },
  {
    keywords: ["doctor", "sharma", "aarav", "about", "background"],
    reply: () =>
      `${CLINIC_INFO.about}\n\n` +
      `**${CLINIC_INFO.experience}** of experience · **${CLINIC_INFO.patientsCount} patients treated** · ` +
      `**${CLINIC_INFO.googleRating}-star** rating on Google.`,
  },
];

function matchQuickIntent(message) {
  const text = message.toLowerCase();
  const matched = INTENTS.find((intent) => matchesAny(text, intent.keywords));
  return matched ? matched.reply() : null;
}

const SYSTEM_PROMPT = `You are OrthoAI, the virtual assistant for ${CLINIC_INFO.clinicName}.

Clinic facts (always use these exact details if relevant — never invent different ones):
- Clinic name: ${CLINIC_INFO.clinicName}
- Doctor: ${CLINIC_INFO.doctorName}, ${CLINIC_INFO.specialty}, ${CLINIC_INFO.experience} experience
- Patients treated: ${CLINIC_INFO.patientsCount}
- Google rating: ${CLINIC_INFO.googleRating} stars
- Location: ${CLINIC_INFO.clinicAddress}
- Phone: ${CLINIC_INFO.phone}
- Email: ${CLINIC_INFO.email}
- Hours: ${CLINIC_INFO.hours}
- About: ${CLINIC_INFO.about}

Specialties offered:
${CLINIC_INFO.specialties.map((s) => `- ${s}`).join("\n")}

Conditions treated:
${CLINIC_INFO.conditionsTreated.join(", ")}

Rules:
- Answer politely and professionally, and keep answers concise.
- Answer orthopedic and clinic-related questions accurately using the facts above.
- If asked for a diagnosis or treatment for a specific personal symptom, recommend consulting the doctor directly rather than giving medical advice.
- If you don't know something outside these facts, say so instead of making it up.
- Never write placeholder text such as [insert clinic name] — always use the exact facts above.`;

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ reply: "Message is required." });
    }

    // --- 1. Try an instant, hardcoded answer first ---
    const quickReply = matchQuickIntent(message);
    if (quickReply) {
      return res.json({ reply: quickReply }); // plain JSON — frontend handles this path
    }

    // --- 2. Otherwise, stream from Groq (Llama 3.1 8B Instant) ---
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    if (res.flushHeaders) res.flushHeaders();

    const stream = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0.5,
      max_tokens: 500,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) res.write(token);
    }

    res.end();
  } catch (err) {
    console.error("Groq API error:", err);
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({ reply: "Sorry, I'm unable to respond right now." });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));