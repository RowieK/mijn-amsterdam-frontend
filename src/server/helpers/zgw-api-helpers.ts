import { SignJWT } from 'jose';

// Gedeelde helpers voor de ZGW-APIs (Open Zaak, Open Notificaties) die met een JWT (HS256) authenticeren.

export type ZgwJwtCredentials = {
  clientId?: string;
  jwtSecret?: string;
};

export function hasZgwJwtCredentials<T extends ZgwJwtCredentials>(
  credentials: T
): credentials is T & Required<ZgwJwtCredentials> {
  return !!credentials.clientId && !!credentials.jwtSecret;
}

// Maakt per aanroep een nieuw token. De secret blijft in het geheugen en komt nergens in een log of foutmelding.
export async function createZgwJwt({
  clientId,
  jwtSecret,
}: Required<ZgwJwtCredentials>): Promise<string> {
  return new SignJWT({
    client_id: clientId,
    user_id: clientId,
    user_representation: clientId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(clientId)
    .setIssuedAt()
    .sign(new TextEncoder().encode(jwtSecret));
}

// De basis-URL's uit de omgeving eindigen meestal op een slash. Dit voorkomt een dubbele slash in het pad.
export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
