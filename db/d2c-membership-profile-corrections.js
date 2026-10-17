import {d2cVariantSeed} from "./d2c-variant-seed.js";

// Correct two ambiguous upstream names exposed by functional membership review.
// Never edit the already-applied original profile seed.
export async function d2cMembershipProfileCorrections() {
  const {payload}=await d2cVariantSeed();
  const profile=payload.profiles.find(p=>p.key==="foodFresh");
  if(!profile)throw Error("Pinned food profile missing");
  const correction={types:["drag_es","pouch_meal"],profile_key:profile.key,axes:profile.axes};
  return {payload:correction,sql:`INSERT INTO d2c_profile_correction_seed(payload) VALUES ('${JSON.stringify(correction).replaceAll("'","''")}'::jsonb);`};
}
