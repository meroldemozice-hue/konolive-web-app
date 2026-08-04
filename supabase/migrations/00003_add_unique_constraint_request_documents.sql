-- Fix: upsert(onConflict:'request_id') needs a UNIQUE constraint
ALTER TABLE request_documents
  ADD CONSTRAINT request_documents_request_id_key UNIQUE (request_id);