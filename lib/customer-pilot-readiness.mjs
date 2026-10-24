// Exact-contact readiness; a confirmed login for customer A cannot satisfy
// the grant requirements for customer B. This does not prove field acceptance.
export function findReadyCustomerContacts(contacts) {
 if(!Array.isArray(contacts))return [];
 return contacts.filter(contact=>
  contact?.status==="active" &&
  contact.account_linked===true &&
  Array.isArray(contact.locations) &&
  contact.locations.some(location=>
   location?.active===true &&
   location.revoked!==true &&
   location.basic_portal===true)
 );
}
