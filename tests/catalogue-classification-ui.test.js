import test from "node:test";
import assert from "node:assert/strict";
import { buildClassification } from "../src/public/catalogue-classification-ui.js";

const base = { revision: 2, typeId: "5", categoryId: 1, subcategoryId: 3 };
const options = [{ id: 9, name: "Size", values: [{ id: 91, value: "S" }, { id: 92, value: "M" }] }];
test("no type sends nothing, cleared saved type sends clear", () => {
  assert.equal(buildClassification({ ...base, typeId: "" }), undefined);
  assert.deepEqual(buildClassification({ ...base, typeId: "", initial: { product_type_id: 5, expected_revision: 4 } }), { clear: true, expected_revision: 4 });
});
test("ids align to axes and required descriptors are enforced", () => {
  const descriptors = [{ id: 1, name: "Fabric", input_type: "single_select", is_required: true, values: [{ id: 7, value: "Cotton" }] }];
  assert.throws(() => buildClassification({ ...base, axes: [], options, descriptors }), /Fabric/);
  const out = buildClassification({ ...base, axes: [{ name: "Size", values: ["M"] }], options, descriptors, descriptorState: { 1: { ids: [7] } } });
  assert.deepEqual(out.options, [{ option_id: 9, value_ids: [92] }]);
  assert.deepEqual(out.descriptors, [{ descriptor_id: 1, value_ids: [7] }]);
  assert.equal(out.expected_revision, 2);
});
test("saved inactive choices are kept, unapproved new ones fail", () => {
  const initial = { product_type_id: 5, expected_revision: 3, options: [{ option_id: 8, value_ids: [81] }], descriptors: [{ descriptor_id: 4, text_value: "x" }] };
  const out = buildClassification({ ...base, initial, axes: [{ name: "Old", values: ["A"] }], savedAxes: [{ name: "Old", values: ["A"] }] });
  assert.deepEqual(out.options, [{ option_id: 8, value_ids: [81] }]);
  assert.deepEqual(out.descriptors, initial.descriptors);
  assert.throws(() => buildClassification({ ...base, initial, axes: [{ name: "Old", values: ["B"] }], savedAxes: [{ name: "Old", values: ["A"] }] }), /not an approved value/);
});

import { renderDescriptors, renderSavedSummary } from "../src/public/catalogue-classification-ui.js";
test("descriptor ids must be active or unchanged saved ids", () => {
  const descriptors = [{ id: 1, name: "Fabric", input_type: "single_select", values: [{ id: 7, value: "Cotton" }] }];
  assert.throws(() => buildClassification({ ...base, options, descriptors, descriptorState: { 1: { ids: [99] } } }), /approved value/);
  const initial = { product_type_id: 5, expected_revision: 1, options: [], descriptors: [{ descriptor_id: 1, value_ids: [99] }] };
  assert.deepEqual(buildClassification({ ...base, initial, options, descriptors, descriptorState: { 1: { ids: [99] } } }).descriptors, [{ descriptor_id: 1, value_ids: [99] }]);
  assert.throws(() => buildClassification({ ...base, options, descriptors, descriptorState: { 1: { ids: [99] } }, initial: { ...initial, product_type_id: 6 } }), /approved value/);
});
test("required boolean false works and long text is rejected", () => {
  const b = [{ id: 2, name: "Handmade", input_type: "boolean", is_required: true, values: [] }];
  assert.deepEqual(buildClassification({ ...base, options, descriptors: b, descriptorState: { 2: { bool: "false" } } }).descriptors, [{ descriptor_id: 2, boolean_value: false }]);
  const t = [{ id: 3, name: "Notes", input_type: "text", values: [] }];
  assert.throws(() => buildClassification({ ...base, options, descriptors: t, descriptorState: { 3: { text: "x".repeat(4001) } } }), /4000/);
  assert.match(renderDescriptors(t, {}), /maxlength="4000"/);
});
test("saved values stay visible and retired types show a summary; option order is kept", () => {
  const d = [{ id: 1, name: "Fabric", input_type: "multi_select", values: [{ id: 7, value: "Cotton" }] }];
  const ref = { descriptors: [{ id: 1, name: "Fabric", values: [{ id: 99, value: "Jute" }] }] };
  assert.match(renderDescriptors(d, { 1: { ids: [99, 7] } }, ref), /Jute \(saved, not currently offered\)/);
  assert.match(renderSavedSummary({ descriptors: [{ descriptor_id: 1, value_ids: [99] }] }, ref), /Fabric[\s\S]*Jute/);
  const two = [{ id: 9, name: "Size", values: [{ id: 91, value: "S" }, { id: 92, value: "M" }] }, { id: 10, name: "Colour", values: [{ id: 1, value: "Red" }, { id: 2, value: "Blue" }] }];
  const out = buildClassification({ ...base, options: two, axes: [{ name: "Colour", values: ["Blue", "Red"] }, { name: "Size", values: ["M", "S"] }] });
  assert.deepEqual(out.options, [{ option_id: 10, value_ids: [2, 1] }, { option_id: 9, value_ids: [92, 91] }]);
});
