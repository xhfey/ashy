---
paths:
  - "src/services/**/*.js"
  - "prisma/**"
---

# Prisma Best Practices for Ashy Bot

## ALWAYS Use Transactions for Coin Operations

```javascript
// ✅ CORRECT - Atomic transaction
await prisma.$transaction([
  prisma.user.update({
    where: { discordId: senderId },
    data: { ashyCoins: { decrement: amount } }
  }),
  prisma.user.update({
    where: { discordId: recipientId },
    data: { ashyCoins: { increment: amount } }
  }),
  prisma.transaction.create({
    data: {
      type: 'TRANSFER',
      amount,
      fromUserId: senderId,
      toUserId: recipientId
    }
  })
]);

// ❌ WRONG - Can cause inconsistency if one fails
await prisma.user.update({ ... }); // Might succeed
await prisma.user.update({ ... }); // Might fail - coins lost!
```

## Use Select to Fetch Only Needed Fields

```javascript
// ✅ CORRECT - Only fetch what you need
const user = await prisma.user.findUnique({
  where: { discordId },
  select: {
    id: true,
    ashyCoins: true,
    // Don't fetch everything
  }
});

// ❌ WRONG - Fetches entire record
const user = await prisma.user.findUnique({
  where: { discordId }
});
```

## Avoid N+1 Queries

```javascript
// ✅ CORRECT - Single query with include
const users = await prisma.user.findMany({
  include: {
    gameStats: true
  }
});

// ❌ WRONG - N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const stats = await prisma.gameStat.findMany({
    where: { userId: user.id }
  }); // This runs N times!
}
```

## Always Check Record Exists

```javascript
// ✅ CORRECT - Check before using
const user = await prisma.user.findUnique({
  where: { discordId }
});

if (!user) {
  // Create new user or return error
  return await prisma.user.create({
    data: { discordId, ashyCoins: 100 }
  });
}

// ❌ WRONG - Assumes user exists
const user = await prisma.user.findUnique({ where: { discordId } });
return user.ashyCoins; // Crashes if null!
```

## Add Indexes for Query Performance

In schema.prisma:

```prisma
model User {
  id        String @id @default(uuid())
  discordId String @unique
  ashyCoins Int    @default(100)
  
  @@index([ashyCoins]) // For leaderboard queries
}

model GameStat {
  id     String @id @default(uuid())
  game   String
  wins   Int    @default(0)
  userId String
  user   User   @relation(fields: [userId], references: [id])
  
  @@index([game, wins]) // For game-specific leaderboards
  @@index([userId])     // For user stats lookup
}
```

## Upsert for Create-or-Update

```javascript
// ✅ CORRECT - Atomic upsert
const user = await prisma.user.upsert({
  where: { discordId },
  update: { lastActive: new Date() },
  create: { discordId, ashyCoins: 100 }
});

// ❌ WRONG - Race condition possible
const user = await prisma.user.findUnique({ where: { discordId } });
if (user) {
  await prisma.user.update({ ... });
} else {
  await prisma.user.create({ ... });
}
```
