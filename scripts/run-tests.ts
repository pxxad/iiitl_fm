import { runPhase3Tests } from "../src/lib/__tests__/phase3-validation.test";
import { runPhase4Tests } from "../src/lib/__tests__/phase4-playback.test";
import { runPhase5Tests } from "../src/lib/__tests__/phase5-realtime.test";
import { runPhase6Tests } from "../src/lib/__tests__/phase6-governance.test";
import { runOAuthRedirectTests } from "../src/lib/__tests__/oauth-redirect.test";
import { runPhase8aTests } from "../src/lib/__tests__/phase8a-spotify-submission.test";

async function main() {
  console.log("=========================================");
  console.log("  IIITL FM — Test Suite Runner (Phases 3–8A) ");
  console.log("=========================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function printResults(results: { test: string; passed: boolean; error?: string }[]) {
    for (const r of results) {
      if (r.passed) {
        passedCount++;
        console.log(`  ✓ ${r.test}`);
      } else {
        failedCount++;
        console.error(`  ✗ ${r.test} - ${r.error}`);
      }
    }
  }

  console.log("--- Running Phase 3 Tests ---");
  const p3Results = await runPhase3Tests();
  printResults(p3Results);

  console.log("\n--- Running Phase 4 Tests ---");
  const p4Results = await runPhase4Tests();
  printResults(p4Results);

  console.log("\n--- Running Phase 5 Tests ---");
  const p5Results = await runPhase5Tests();
  printResults(p5Results);

  console.log("\n--- Running Phase 6 Tests ---");
  const p6Results = await runPhase6Tests();
  printResults(p6Results);

  console.log("\n--- Running OAuth & Auth Flow Tests ---");
  const oauthResults = await runOAuthRedirectTests();
  printResults(oauthResults);

  console.log("\n--- Running Phase 8A: Spotify Track Submission Tests ---");
  const p8aResults = await runPhase8aTests();
  printResults(p8aResults);

  const total =
    p3Results.length +
    p4Results.length +
    p5Results.length +
    p6Results.length +
    oauthResults.length +
    p8aResults.length;
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


