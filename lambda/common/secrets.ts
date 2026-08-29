import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
const cache = new Map<string, string>();

export async function getSecret(arn: string): Promise<string> {
  const cached = cache.get(arn);
  if (cached) return cached;

  const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = result.SecretString;
  if (!value) {
    throw new Error(`Secret ${arn} has no SecretString value`);
  }
  cache.set(arn, value);
  return value;
}
