import type { SupabaseClient } from "@supabase/supabase-js";

export function storagePathFromPublicUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

const SIGNED_URL_TTL = 3600;

export async function signedStorageUrl(
  client: SupabaseClient,
  bucket: string,
  pathOrUrl: string | null | undefined,
  expiresIn = SIGNED_URL_TTL
): Promise<string | null> {
  if (!pathOrUrl) return null;
  const path = pathOrUrl.includes("/storage/v1/object/public/")
    ? storagePathFromPublicUrl(pathOrUrl)
    : pathOrUrl;
  if (!path) return null;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function signList<T>(
  client: SupabaseClient,
  bucket: string,
  rows: T[],
  pick: (row: T) => { path: string | null; urlField: keyof T }
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const { path, urlField } = pick(row);
      const signed = await signedStorageUrl(client, bucket, path);
      if (signed) return { ...row, [urlField]: signed };
      return row;
    })
  );
}
