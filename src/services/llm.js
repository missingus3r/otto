import OpenAI from 'openai';

let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

const SYSTEM_PROMPT = `You are the matching agent for otto, an agent-mediated marketplace.

Listings can be of three types:
- "sell": user wants to sell an item; priceMin/priceMax is the price range they accept.
- "buy":  user wants to buy an item; priceMin/priceMax is the budget range.
- "swap": user wants to exchange one item for another (see swapForDescription).

Your job: given a JSON array of OPEN listings, propose 0 or more compatible matches between PAIRS of listings owned by DIFFERENT users.

Rules:
1. Never match a listing with itself or with another listing from the same userId.
2. A "sell" matches a "buy" only if their price ranges overlap. proposedPrice should be the midpoint of the overlap.
3. A "swap" matches another "swap" if the items each one offers plausibly satisfy the other side's swapForDescription.
4. A "swap" can also match a "sell" or "buy" if the swap item plausibly substitutes for cash within the price range.
5. Score is 0-100. Use 80+ only for very compatible matches (clear price overlap, very related items, same currency).
6. The rationale must be ONE sentence, in the same language as the listings (default Spanish), explaining why this match makes sense to a human.
7. Skip ambiguous pairs. Quality over quantity. If nothing is a good match, return an empty array.
8. Output strictly valid JSON of the form: { "matches": [ { "listingAId": "...", "listingBId": "...", "score": 0-100, "rationale": "...", "proposedPrice": number, "currency": "UYU|USD|..." } ] }`;

export async function matchListings(openListings) {
  if (!Array.isArray(openListings) || openListings.length < 2) {
    return { matches: [], tokensUsed: 0 };
  }

  const client = getClient();
  const model = process.env.AGENT_MODEL || 'gpt-4o-mini';

  const compactListings = openListings.map((l) => ({
    id: String(l._id),
    userId: String(l.userId),
    type: l.type,
    title: l.title,
    description: l.description || '',
    priceMin: l.priceMin || 0,
    priceMax: l.priceMax || 0,
    currency: l.currency || 'UYU',
    swapForDescription: l.swapForDescription || '',
  }));

  const userMessage = `Here are the currently open listings (JSON):\n\n${JSON.stringify(
    compactListings,
    null,
    2
  )}\n\nPropose 0..N matches following the rules. Output strict JSON.`;

  let resp;
  try {
    resp = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });
  } catch (err) {
    console.error('[llm] OpenAI error:', err.message);
    throw err;
  }

  const tokensUsed = (resp.usage && resp.usage.total_tokens) || 0;
  const raw = resp.choices?.[0]?.message?.content || '{"matches":[]}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[llm] could not parse JSON output:', raw);
    parsed = { matches: [] };
  }

  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

  // sanity filtering
  const valid = matches.filter((m) => {
    if (!m || !m.listingAId || !m.listingBId) return false;
    if (m.listingAId === m.listingBId) return false;
    const score = Number(m.score);
    if (Number.isNaN(score) || score < 0 || score > 100) return false;
    return true;
  });

  return { matches: valid, tokensUsed };
}

export default { matchListings };
