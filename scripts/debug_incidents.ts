import { db } from "@devops-guardian/shared";

async function main() {
  try {
    const incidents = await db.incident.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    console.log("Recent Incidents in DB:");
    incidents.forEach((i) => {
      console.log(`- [${i.status}] ${i.title} (ID: ${i.id})`);
      console.log(`  Metadata:`, JSON.stringify(i.metadata || {}, null, 2));
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
