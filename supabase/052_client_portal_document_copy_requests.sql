-- A location-link holder may request an approved signed contract copy.
-- This is a request/status workflow only: NO file bytes, URLs, private documents,
-- customer billing, staff details or other locations become visible to bearer links.
-- Management delivers any actual copy separately after verifying the recipient.
alter table public.portal_messages
 drop constraint if exists portal_messages_category_check;
alter table public.portal_messages
 add constraint portal_messages_category_check
 check(category in ('general','service_problem','callback_request','document_copy'));

-- Exactly one unresolved document request per existing location token.
-- A resolved request can be followed by a later separate request.
create unique index if not exists portal_messages_one_open_document_copy_per_token
 on public.portal_messages(portal_token_id)
 where category='document_copy'
   and customer_status in ('received','in_progress')
   and portal_token_id is not null;

-- Do not allow the shared-link history to become a way to publish a file link.
-- The location-link read RPC already selects only category, timestamp,
-- status and manager-authored customer_response; original message stays private.
alter table public.portal_messages
 add constraint portal_messages_document_copy_response_no_url
 check(
   category<>'document_copy'
   or customer_response is null
   or (
     customer_response !~* '(https?://|www[.])'
     and customer_response !~* '(\.pdf|\.docx?|\.zip)(\?|$|[[:space:]])'
   )
 );
