// enforce only one package at a time per user
const active = await db.purchases.findOne({
    userId,
    expiresAt: { $gt: new Date() },
    creditsLeft: { $gt: 0 }
  })
if (active) throw Error("You already have an active package");
 