import { PrismaClient } from '@prisma/client';
import { BUILTIN_MAPS } from '../src/maps/builtins.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const map of BUILTIN_MAPS) {
    await prisma.map.upsert({
      where: { id: map.id },
      create: {
        id: map.id,
        name: map.name,
        mode: map.mode,
        visibility: 'public',
        isBuiltin: true,
        data: map.definition as object,
      },
      update: {
        name: map.name,
        mode: map.mode,
        data: map.definition as object,
      },
    });
  }
  console.log(`Seeded ${BUILTIN_MAPS.length} builtin maps.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
