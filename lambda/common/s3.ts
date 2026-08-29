import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({});
const BUCKET = process.env.IMAGE_BUCKET_NAME!;

async function putObject(key: string, body: Buffer | string, contentType: string): Promise<void> {
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

export async function putImage(key: string, data: Buffer, mimeType: string): Promise<void> {
  await putObject(key, data, mimeType);
}

export async function putText(key: string, text: string): Promise<void> {
  await putObject(key, text, "text/plain; charset=utf-8");
}

export async function putJson(key: string, data: unknown): Promise<void> {
  await putObject(key, JSON.stringify(data, null, 2), "application/json");
}

export async function getImage(key: string): Promise<{ data: Buffer; mimeType: string }> {
  const result = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await result.Body!.transformToByteArray();
  return { data: Buffer.from(bytes), mimeType: result.ContentType || "image/png" };
}

// Lambda execution role credentials are temporary (STS), so a presigned URL
// stops working once those credentials expire even if expiresIn is longer —
// keep this well within a single Lambda credential lifetime.
export async function getPresignedUrl(key: string, expiresInSeconds = 12 * 60 * 60): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
