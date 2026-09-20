/**
 * The gate on the parent area.
 *
 * Be clear about what this is: a child-proof gate, not security. There is no
 * server to verify a WebAuthn assertion against, so the check happens in the
 * page and anyone with devtools can step past it. Against an eight-year-old it
 * is entirely sufficient, and nothing behind it is sensitive.
 *
 * There is no lockout risk either. The credential handle lives in
 * localStorage, so clearing site data removes the enrolment along with the data
 * it guards -- the app just returns to first-run.
 */

import type { ParentLockRecord, Store } from '../storage/store';

const UNLOCK_WINDOW_MS = 5 * 60 * 1000;
const RP_NAME = 'Math Flash';

function toBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '='));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  // Allocate the buffer explicitly so the type is ArrayBuffer, not ArrayBufferLike,
  // which is what the WebAuthn BufferSource parameters require.
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

/** Whether this device can do Face ID / Touch ID / device passcode in the browser. */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    if (typeof PublicKeyCredential === 'undefined') return false;
    if (!window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64url(digest);
}

export interface ParentLock {
  isEnrolled(): boolean;
  enrolledKind(): ParentLockRecord['kind'] | null;
  isUnlocked(): boolean;
  lock(): void;
  enrolBiometric(): Promise<void>;
  enrolPin(pin: string): Promise<void>;
  unlockBiometric(): Promise<void>;
  unlockPin(pin: string): Promise<void>;
  forget(): void;
}

export function createParentLock(store: Store): ParentLock {
  let unlockedUntil = 0;

  const record = (): ParentLockRecord | null => store.getParentLock();

  const grant = (): void => {
    unlockedUntil = Date.now() + UNLOCK_WINDOW_MS;
  };

  return {
    isEnrolled: () => record() !== null,
    enrolledKind: () => record()?.kind ?? null,
    isUnlocked: () => Date.now() < unlockedUntil,
    lock: () => {
      unlockedUntil = 0;
    },

    async enrolBiometric() {
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32),
          rp: { name: RP_NAME, id: location.hostname },
          user: { id: randomBytes(16), name: 'parent', displayName: 'Parent' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;

      if (!credential) throw new Error('Face ID setup was cancelled.');

      store.saveParentLock({
        kind: 'webauthn',
        credentialId: toBase64url(credential.rawId),
        enrolledAt: new Date().toISOString(),
      });
      grant();
    },

    async enrolPin(pin: string) {
      const salt = toBase64url(randomBytes(16).buffer);
      store.saveParentLock({
        kind: 'pin',
        salt,
        pinHash: await hashPin(pin, salt),
        enrolledAt: new Date().toISOString(),
      });
      grant();
    },

    async unlockBiometric() {
      const saved = record();
      if (!saved?.credentialId) throw new Error('No Face ID is set up on this device.');

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          allowCredentials: [
            { type: 'public-key', id: fromBase64url(saved.credentialId) },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (!assertion) throw new Error('That did not unlock.');
      grant();
    },

    async unlockPin(pin: string) {
      const saved = record();
      if (!saved?.pinHash || !saved.salt) throw new Error('No PIN is set up on this device.');
      if ((await hashPin(pin, saved.salt)) !== saved.pinHash) throw new Error('Wrong PIN.');
      grant();
    },

    forget() {
      unlockedUntil = 0;
    },
  };
}
