/**
 * Creates a demo account through the Supabase Auth admin API: demo@example.com / demo12345.
 * The signup trigger in the migration creates its Store (simulation mode) and AutopilotSettings rows.
 * Run: npm run seed   (requires the migration to be applied first)
 */
import "dotenv/config";
import { admin } from "../src/lib/db";

async function main() {
  const { error } = await admin().auth.admin.createUser({
    email: "demo@example.com",
    password: "demo12345",
    email_confirm: true,
    user_metadata: { name: "Demo" },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return console.log("Demo user already exists");
    throw error;
  }
  console.log("Created demo@example.com / demo12345");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
