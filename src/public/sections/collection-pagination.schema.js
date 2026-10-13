import { section, select } from "./schema-helpers.js";
export default section("collection-pagination", "Pagination", ["collection"], { page_size: select(["12", "24", "48"], "24") });
