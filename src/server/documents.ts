import { documentFilesReady, saveDocumentFile } from "./db-store";

/**
 * Verification document files (NID, photo, trade license …). The bytes live
 * in the `document_files` table, outside the per-request snapshot; the
 * verification_documents row keeps the metadata, and GET /api/documents/:id
 * serves the file to administrators.
 */

let warned = false;

/**
 * Stores an upload's bytes. Without the document_files migration the upload
 * still succeeds with metadata only (the viewer then says the file wasn't kept).
 */
export async function storeDocumentFile(documentId: string, mimeType: string, sha256: string, data: Uint8Array) {
  if (!(await documentFilesReady())) {
    if (!warned) {
      warned = true;
      console.warn("[documents] document_files is missing — run supabase/migrations/20261007_document_files.sql to keep uploaded files. Storing metadata only.");
    }
    return;
  }
  await saveDocumentFile({ documentId, mimeType, sha256, data });
}
