import {
  checkSourceText, exactTwoSidedMcNemar, verifySource, verifyTarget,
} from "../r2-final-transfer/verifier.js";
import { TARGET_COUNT } from "./fixtures.js";

export { checkSourceText, exactTwoSidedMcNemar, verifySource, verifyTarget };

export function analyze(arms: Array<{ pair: number; arm: "on" | "off"; protocol_valid: boolean; passed: boolean }>) {
  const pairs = [];
  for (let pair = 0; pair < TARGET_COUNT; pair++) {
    const on = arms.find(x => x.pair === pair && x.arm === "on");
    const off = arms.find(x => x.pair === pair && x.arm === "off");
    if (on?.protocol_valid && off?.protocol_valid) pairs.push({ pair, on: on.passed, off: off.passed });
  }
  const b = pairs.filter(x => x.on && !x.off).length;
  const c = pairs.filter(x => !x.on && x.off).length;
  const onPassed = pairs.filter(x => x.on).length;
  const offPassed = pairs.filter(x => x.off).length;
  return {
    valid_pairs: pairs.length, on_passed: onPassed, off_passed: offPassed,
    on_rate: pairs.length ? onPassed / pairs.length : null,
    off_rate: pairs.length ? offPassed / pairs.length : null,
    delta: pairs.length ? (onPassed - offPassed) / pairs.length : null,
    b, c, p: exactTwoSidedMcNemar(b, c), pairs,
  };
}
