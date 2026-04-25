// Tiny pagination helper used by admin tables.
//
// Usage:
//   const { items, page, limit, total, pages } = await paginate(
//     User.find({}).sort({ createdAt: -1 }),
//     req.query.page,
//     req.query.limit
//   );

export async function paginate(query, pageRaw, limitRaw) {
  const page = Math.max(1, parseInt(pageRaw, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20));
  const skip = (page - 1) * limit;

  // We need a parallel countDocuments — clone the query filter.
  const Model = query.model;
  const filter = query.getFilter ? query.getFilter() : {};

  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);

  const pages = Math.max(1, Math.ceil(total / limit));
  console.log(`[pager] ${Model.modelName} page=${page}/${pages} limit=${limit} total=${total}`);

  return { items, page, limit, total, pages };
}

export default paginate;
