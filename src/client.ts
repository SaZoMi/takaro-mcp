import { config } from 'dotenv';
import { Client } from '@takaro/apiclient';

config();

let cachedClient: Client | null = null;

export async function getClient(): Promise<Client> {
  if (cachedClient) return cachedClient;

  const url = process.env['TAKARO_HOST'];
  const username = process.env['TAKARO_USERNAME'];
  const password = process.env['TAKARO_PASSWORD'];
  const domainId = process.env['TAKARO_DOMAIN_ID'];

  if (!url) throw new Error('TAKARO_HOST is required in .env');
  if (!username) throw new Error('TAKARO_USERNAME is required in .env');
  if (!password) throw new Error('TAKARO_PASSWORD is required in .env');
  if (!domainId) throw new Error('TAKARO_DOMAIN_ID is required in .env');

  const client = new Client({ url, auth: { username, password }, log: false });
  await client.login();
  client.setDomain(domainId);

  cachedClient = client;
  return client;
}

/** Reset the cached client (e.g. after a credentials change). */
export function resetClient(): void {
  cachedClient = null;
}
