import { runPhase3Tests } from "../src/lib/__tests__/phase3-validation.test";
import { runPhase4Tests } from "../src/lib/__tests__/phase4-playback.test";

async function main() {
  console.log("=========================================");
  console.log("  IIITL FM — Test Suite Runner (Phases 3 & 4) ");
  console.log("=========================================\n");

  console.log("--- Running Phase 3 Tests ---");
  const p3Results = await runPhase3Tests();
  let passedCount = 0;
  let failedCount = 0;

  for (const r of p3Results) {
    if (r.passed) {
      passedCount++;
      console.log(`  ✓ ${r.test}`);
    } else {
      failedCount++;
      console.error(`  ✗ ${r.test} - ${r.error}`);
    }
  }

  console.log("\n--- Running Phase 4 Tests ---");
  const p4Results = await runPhase4Tests();

  for (const r of p4Results) {
    if (r.passed) {
      passedCount++;
      console.log(`  ✓ ${r.test}`);
    } else {
      failedCount++;
      console.error(`  ✗ ${r.test} - ${r.error}`);
    }
  }

  const total = p3Results.length + p4Results.length;
  console.log("\n-----------------------------------------");
  console.log(`Total: ${total} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log("-----------------------------------------");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

