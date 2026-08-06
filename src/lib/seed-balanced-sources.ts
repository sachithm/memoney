import { prisma } from "./prisma";

async function main() {
  const sources = [
    "Cash",
    "HSBC Checking",
    "HSBC Savings",
    "Amex Credit Card",
    "Monzo",
    "Revolut",
    "Trading 212",
  ];

  for (const name of sources) {
    await prisma.balanceSource.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`Seeded ${sources.length} balance sources`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
