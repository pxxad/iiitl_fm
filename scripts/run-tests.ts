import { runPhase3Tests } from "../src/lib/__tests__/phase3-validation.test";

console.log("=========================================");
console.log("  IIITL FM — Phase 3 Test Suite Runner   ");
console.log("=========================================\n");

const results = runPhase3Tests();

let passedCount = 0;
let failedCount = 0;

for (const r of results) {
  if (r.passed) {
    passedCount++;
    console.log(`  ✓ ${r.test}`);
  } else {
    failedCount++;
    console.error(`  ✗ ${r.test} - ${r.error}`);
  }
}

console.log("\n-----------------------------------------");
console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
console.log("-----------------------------------------");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!\n");
}
