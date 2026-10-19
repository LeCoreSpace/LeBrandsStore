// Shared public editorial record builders. Dates reflect publication, not verification.
export const article=(slug,title,description,category,summary,takeaways,sections,faqs,related,imageAlt)=>({
  slug,title,description,category,summary,takeaways,sections,faqs,related,imageAlt,
  image:`/img/blog/${slug}.svg`,author:"LeBrands.Store editorial team",published:"2026-10-19",
});
export const section=(id,heading,paragraphs,bullets=[])=>({id,heading,paragraphs,bullets});
export const faq=(question,answer)=>({question,answer});
