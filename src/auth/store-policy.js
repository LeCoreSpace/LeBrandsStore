export function ownedStorePolicy(stores) {
 const owned=(Array.isArray(stores)?stores:[]).filter(store=>store.role==="owner");
 const live=owned.filter(store=>store.status==="live");
 return {owned,live,canCreate:owned.length<2,creationLabel:owned.length?"Create a draft store":"Create a store"};
}
